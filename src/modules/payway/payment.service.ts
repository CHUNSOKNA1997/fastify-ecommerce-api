import axios from 'axios'
import type { FastifyBaseLogger } from 'fastify'
import { PaymentRepository } from './payment.repository'
import type { Payment } from './payment.model'
import {
  buildRequestTime,
  extractCallbackSignature,
  generatePurchaseHash,
  generateTransactionDetailHash,
  generateTransactionId,
  verifyCallbackHash
} from './payway.util'
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  PaywayCallbackPayload,
  PaywayCheckTransactionResponse,
  PaywayCheckoutPageResult,
  PaywayPurchaseApiResponse,
  PaywayPurchaseRequest,
  PaymentStatusResult,
  PaymentSummary
} from './payway.types'

type PaywayConfig = {
  apiKey: string
  merchantId: string
  purchaseUrl: string
  checkoutBaseUrl: string
  transactionDetailUrl: string
  requireWebhookSignature: boolean
  webhookUrl?: string
  returnUrl?: string
  cancelUrl?: string
  continueSuccessUrl?: string
}

export class PaymentService {
  constructor(private readonly repo = new PaymentRepository()) {}

  async createCheckout(
    input: CreateCheckoutInput,
    baseUrl: string,
    logger: FastifyBaseLogger
  ): Promise<CreateCheckoutResult> {
    const normalizedOrderId = input.orderId.trim()
    if (!normalizedOrderId) {
      throw new Error('orderId is required')
    }

    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error('amount must be a positive number')
    }

    const config = this.getConfig()
    const normalizedAmount = Number(input.amount.toFixed(2))
    const checkoutExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    const existingPayment = await this.repo.findByOrderId(normalizedOrderId)
    if (existingPayment?.status === 'SUCCESS') {
      throw new Error('Payment already completed for this order')
    }

    const tranId = generateTransactionId()
    const request = this.buildPurchaseRequest({
      amount: normalizedAmount,
      orderId: normalizedOrderId,
      tranId,
      baseUrl,
      config
    })

    const payment = existingPayment
      ? await this.repo.updatePendingPaymentByOrderId(normalizedOrderId, {
        tranId,
        amount: normalizedAmount,
        currency: request.currency,
        purchaseRequest: request,
        checkoutExpiresAt
      })
      : await this.repo.create({
        orderId: normalizedOrderId,
        tranId,
        amount: normalizedAmount,
        currency: request.currency
      })

    if (!payment) {
      throw new Error('Unable to create payment')
    }

    const signedPayload = {
      ...request,
      hash: generatePurchaseHash(request, config.apiKey)
    }

    const storedPayment = await this.repo.recordPurchaseRequest(payment.id, request, checkoutExpiresAt)
    await this.repo.appendLog(payment.id, {
      event: 'CHECKOUT_CREATED',
      timestamp: new Date().toISOString(),
      details: {
        amount: normalizedAmount,
        orderId: normalizedOrderId,
        tranId
      }
    })

    if (!storedPayment) {
      throw new Error('Unable to persist purchase request')
    }

    await this.repo.appendLog(storedPayment.id, {
      event: 'CHECKOUT_PAYLOAD_READY',
      timestamp: new Date().toISOString(),
      details: {
        tranId,
        purchaseUrl: config.purchaseUrl
      }
    })

    return {
      payment: this.toPaymentSummary(storedPayment),
      checkoutUrl: `${baseUrl}/api/payments/checkout/${storedPayment.id}`,
      purchaseUrl: config.purchaseUrl,
      purchasePayload: signedPayload,
      expiresAt: checkoutExpiresAt
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatusResult> {
    const payment = await this.repo.findById(paymentId)
    if (!payment) {
      throw new Error('Payment not found')
    }

    return {
      payment: this.toPaymentSummary(payment),
      expiresAt: payment.payway?.checkoutExpiresAt
    }
  }

  async getCheckoutPage(
    paymentId: string,
    logger: FastifyBaseLogger
  ): Promise<PaywayCheckoutPageResult> {
    const payment = await this.repo.findById(paymentId)
    if (!payment) {
      throw new Error('Payment not found')
    }

    const cachedHtml = payment.payway?.checkoutHtml
    if (cachedHtml) {
      return { html: cachedHtml }
    }

    const purchaseRequest = payment.payway?.purchaseRequest
    if (!purchaseRequest) {
      throw new Error('Purchase request is not available')
    }

    const config = this.getConfig()
    const purchasePayload = {
      ...purchaseRequest,
      hash: generatePurchaseHash(purchaseRequest, config.apiKey)
    }
    const purchaseResponse = await this.fetchPurchaseSession(
      purchasePayload,
      config.purchaseUrl,
      logger
    )
    const html = this.resolveCheckoutHtml(
      payment.orderId,
      payment.amount,
      payment.payway?.checkoutExpiresAt,
      purchaseResponse
    )

    await this.repo.storeCheckoutHtml(payment.id, html)
    await this.repo.appendLog(payment.id, {
      event: 'CHECKOUT_PAGE_RENDERED',
      timestamp: new Date().toISOString(),
      details: {
        providerStatus: typeof purchaseResponse === 'string'
          ? 'HTML'
          : purchaseResponse.status?.code,
        tranId: payment.tranId
      }
    })

    return {
      html
    }
  }

  async processWebhook(
    payload: PaywayCallbackPayload,
    signatureHeader: string | undefined,
    logger: FastifyBaseLogger
  ): Promise<PaymentSummary> {
    const tranId = String(payload.tran_id ?? '').trim()
    if (!tranId) {
      throw new Error('tran_id is required')
    }

    const payment = await this.repo.findByTranId(tranId)
    if (!payment) {
      throw new Error('Payment not found')
    }

    const config = this.getConfig()
    const signature = extractCallbackSignature(payload, signatureHeader)
    if (!verifyCallbackHash(payload, config.apiKey, signature)) {
      await this.repo.appendLog(payment.id, {
        event: 'WEBHOOK_SIGNATURE_REJECTED',
        timestamp: new Date().toISOString(),
        details: {
          tranId
        }
      })

      if (config.requireWebhookSignature) {
        throw new Error('Invalid PayWay webhook signature')
      }
    }

    await this.repo.appendLog(payment.id, {
      event: 'WEBHOOK_RECEIVED',
      timestamp: new Date().toISOString(),
      details: {
        status: payload.status,
        tranId
      }
    })

    const verification = await this.fetchTransactionDetail(tranId, config, logger)
    const nextStatus = this.resolveStatus(payment, payload, verification)

    const updatedPayment = await this.repo.markStatus(payment.id, nextStatus, {
      callback: payload,
      verification
    })

    if (!updatedPayment) {
      throw new Error('Unable to update payment status')
    }

    await this.repo.appendLog(updatedPayment.id, {
      event: `PAYMENT_${nextStatus}`,
      timestamp: new Date().toISOString(),
      details: {
        providerStatus: verification.status?.code,
        paymentStatusCode: verification.data?.payment_status_code
      }
    })

    return this.toPaymentSummary(updatedPayment)
  }

  private buildPurchaseRequest(input: {
    amount: number
    orderId: string
    tranId: string
    baseUrl: string
    config: PaywayConfig
  }): PaywayPurchaseRequest {
    const webhookUrl = input.config.webhookUrl ?? `${input.baseUrl}/api/payments/webhook`
    const continueSuccessUrl = input.config.continueSuccessUrl
      ?? input.config.returnUrl
      ?? `${input.baseUrl}/api/payments/return`
    const cancelUrl = input.config.cancelUrl ?? `${input.baseUrl}/api/payments/cancel`

    return {
      req_time: buildRequestTime(),
      merchant_id: input.config.merchantId,
      tran_id: input.tranId,
      amount: input.amount.toFixed(2),
      type: 'purchase',
      currency: 'USD',
      return_params: input.orderId,
      return_url: webhookUrl,
      cancel_url: cancelUrl,
      ...(continueSuccessUrl ? { continue_success_url: continueSuccessUrl } : {})
    }
  }

  private async fetchPurchaseSession(
    purchasePayload: PaywayPurchaseRequest & { hash: string },
    purchaseUrl: string,
    logger: FastifyBaseLogger
  ): Promise<string | PaywayPurchaseApiResponse> {
    const response = await this.withRetry(
      async () => axios.postForm<string>(purchaseUrl, purchasePayload, {
        responseType: 'text',
        timeout: 15000,
        headers: {
          Accept: 'text/html,application/json'
        }
      }),
      logger,
      'purchase'
    )

    return response.data
  }

  private resolveCheckoutHtml(
    orderId: string,
    amount: number,
    checkoutExpiresAt: string | undefined,
    response: string | PaywayPurchaseApiResponse
  ): string {
    if (typeof response === 'string') {
      const trimmedResponse = response.trim()
      if (trimmedResponse.toLowerCase().includes('<html')) {
        return response
      }

      try {
        const parsed = JSON.parse(trimmedResponse) as PaywayPurchaseApiResponse
        return this.renderCheckoutResponse(orderId, amount, checkoutExpiresAt, parsed)
      } catch {
        return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Payment Unavailable</title>
  </head>
  <body>
    <h1>Payment Unavailable</h1>
    <p>PayWay did not return a valid checkout page.</p>
    <pre>${this.escapeHtml(trimmedResponse)}</pre>
  </body>
</html>`
      }
    }

    return this.renderCheckoutResponse(orderId, amount, checkoutExpiresAt, response)
  }

  private renderCheckoutResponse(
    orderId: string,
    amount: number,
    checkoutExpiresAt: string | undefined,
    response: PaywayPurchaseApiResponse
  ): string {
    const hostedCheckoutUrl = this.buildHostedCheckoutUrl(orderId, amount, checkoutExpiresAt, response)
    if (hostedCheckoutUrl) {
      return this.renderHostedCheckoutRedirectPage(hostedCheckoutUrl)
    }

    return this.renderHostedCheckoutPage(orderId, amount, response)
  }

  private renderHostedCheckoutPage(
    orderId: string,
    amount: number,
    response: PaywayPurchaseApiResponse
  ): string {
    const qrImage = response.data?.image ?? response.qrImage
    const qrString = response.qrString
    const providerCode = String(response.status?.code ?? '')
    const providerMessage = String(response.status?.message ?? response.description ?? 'Unable to initialize PayWay checkout')

    if (providerCode !== '00' || !qrImage) {
      return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Payment Unavailable</title>
  </head>
  <body>
    <h1>Payment Unavailable</h1>
    <p>${this.escapeHtml(providerMessage)}</p>
  </body>
</html>`
    }

    const escapedQrString = qrString ? this.escapeHtml(qrString) : ''

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PayWay Checkout</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Arial, sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f4f7fb;
        color: #122033;
      }
      main {
        width: min(92vw, 440px);
        background: #ffffff;
        border: 1px solid #d7e0ea;
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 18px 48px rgba(18, 32, 51, 0.12);
        text-align: center;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 28px;
      }
      p {
        margin: 8px 0;
      }
      img {
        display: block;
        width: min(100%, 280px);
        margin: 24px auto;
        border-radius: 12px;
      }
      code {
        display: block;
        margin-top: 16px;
        padding: 12px;
        border-radius: 10px;
        background: #eef3f8;
        word-break: break-all;
        text-align: left;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Scan To Pay</h1>
      <p>Order: ${this.escapeHtml(orderId)}</p>
      <p>Amount: $${this.escapeHtml(amount.toFixed(2))}</p>
      <img src="${this.escapeHtml(qrImage)}" alt="PayWay QR code" />
      <p>Complete the payment in your ABA app, then wait for webhook confirmation.</p>
      ${escapedQrString ? `<code>${escapedQrString}</code>` : ''}
    </main>
  </body>
</html>`
  }

  private buildHostedCheckoutUrl(
    orderId: string,
    amount: number,
    checkoutExpiresAt: string | undefined,
    response: PaywayPurchaseApiResponse
  ): string | null {
    const qrString = response.qrString
    if (!qrString) {
      return null
    }

    const checkoutData = {
      status: response.status ?? {
        code: '00',
        message: 'Success!',
        lang: 'en'
      },
      step: 'abapay_khqr_request_qr',
      qr_string: qrString,
      transaction_summary: {
        order_details: {
          subtotal: amount,
          vat_enabled: '0',
          vat: '0',
          shipping: 0,
          vat_amount: 0,
          transaction_fee: 0,
          total: amount,
          currency: 'USD'
        },
        merchant: {
          name: process.env.APP_NAME?.trim() || 'Fastify Ecommerce API',
          logo: '',
          primary_color: '#201B44',
          cancel_url: '',
          themes: 'default',
          font_family: 'SF_Pro_Display',
          font_size: 14,
          bg_color: '#ffffff',
          border_radius: 6
        }
      },
      payment_options: {
        abapay: {
          label: 'ABA Pay'
        }
      },
      expire_in: this.getCheckoutExpiryUnix(checkoutExpiresAt),
      expire_in_sec: '900',
      render_qr_page: 1,
      order_id: orderId
    }

    const token = Buffer.from(JSON.stringify(checkoutData), 'utf8').toString('base64')
    const config = this.getConfig()

    return `${config.checkoutBaseUrl}/${encodeURIComponent(token)}`
  }

  private renderHostedCheckoutRedirectPage(hostedCheckoutUrl: string): string {
    const escapedUrl = this.escapeHtml(hostedCheckoutUrl)

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Redirecting To PayWay</title>
    <meta http-equiv="refresh" content="0;url=${escapedUrl}" />
  </head>
  <body>
    <p>Redirecting to PayWay checkout...</p>
    <p><a href="${escapedUrl}">Continue</a></p>
    <script>
      window.location.replace(${JSON.stringify(hostedCheckoutUrl)});
    </script>
  </body>
</html>`
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  private getCheckoutExpiryUnix(checkoutExpiresAt: string | undefined): number {
    const expiresAtMs = checkoutExpiresAt ? Date.parse(checkoutExpiresAt) : Number.NaN
    if (Number.isFinite(expiresAtMs)) {
      return Math.floor(expiresAtMs / 1000)
    }

    return Math.floor(Date.now() / 1000) + 900
  }

  private async fetchTransactionDetail(
    tranId: string,
    config: PaywayConfig,
    logger: FastifyBaseLogger
  ): Promise<PaywayCheckTransactionResponse> {
    const reqTime = buildRequestTime()
    const hash = generateTransactionDetailHash(
      reqTime,
      config.merchantId,
      tranId,
      config.apiKey
    )

    const response = await this.withRetry(
      async () => axios.postForm<PaywayCheckTransactionResponse>(config.transactionDetailUrl, {
        req_time: reqTime,
        merchant_id: config.merchantId,
        tran_id: tranId,
        hash
      }, {
        timeout: 15000
      }),
      logger,
      'transaction-detail'
    )

    return response.data
  }

  private resolveStatus(
    payment: Payment,
    payload: PaywayCallbackPayload,
    verification: PaywayCheckTransactionResponse
  ): 'SUCCESS' | 'FAILED' {
    const verificationCode = String(verification.status?.code ?? '')
    const paymentStatusCode = Number(verification.data?.payment_status_code)
    const providerAmount = Number(verification.data?.total_amount)
    const providerCurrency = String(verification.data?.payment_currency ?? '')
    const callbackStatus = String(payload.status ?? '')

    const amountMatches = Number.isFinite(providerAmount) && providerAmount === payment.amount
    const currencyMatches = !providerCurrency || providerCurrency === payment.currency
    const providerAccepted = verificationCode === '00' && paymentStatusCode === 0
    const callbackAccepted = callbackStatus === '0' || callbackStatus.toUpperCase() === 'SUCCESS'

    return providerAccepted && callbackAccepted && amountMatches && currencyMatches
      ? 'SUCCESS'
      : 'FAILED'
  }

  private getConfig(): PaywayConfig {
    return {
      apiKey: this.getRequiredEnv('PAYWAY_API_KEY'),
      merchantId: this.getRequiredEnv('PAYWAY_MERCHANT_ID'),
      purchaseUrl:
        process.env.PAYWAY_PURCHASE_URL?.trim() ||
        'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase',
      checkoutBaseUrl:
        process.env.PAYWAY_CHECKOUT_BASE_URL?.trim() ||
        'https://checkout-sandbox.payway.com.kh',
      transactionDetailUrl:
        process.env.PAYWAY_CHECK_TRANSACTION_URL?.trim() ||
        'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/check-transaction-2',
      requireWebhookSignature: this.getBooleanEnv('PAYWAY_WEBHOOK_REQUIRE_SIGNATURE', false),
      webhookUrl: this.getOptionalEnv('PAYWAY_WEBHOOK_URL'),
      returnUrl: this.getOptionalEnv('PAYWAY_RETURN_URL'),
      cancelUrl: this.getOptionalEnv('PAYWAY_CANCEL_URL'),
      continueSuccessUrl: this.getOptionalEnv('PAYWAY_CONTINUE_SUCCESS_URL')
    }
  }

  private getRequiredEnv(name: string): string {
    const value = process.env[name]?.trim()
    if (!value) {
      throw new Error(`${name} is required`)
    }

    return value
  }

  private getOptionalEnv(name: string): string | undefined {
    const value = process.env[name]?.trim()
    return value || undefined
  }

  private getBooleanEnv(name: string, defaultValue: boolean): boolean {
    const value = process.env[name]?.trim().toLowerCase()
    if (!value) {
      return defaultValue
    }

    return value === '1' || value === 'true' || value === 'yes'
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    logger: FastifyBaseLogger,
    operationName: string
  ): Promise<T> {
    const attempts = 3

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await operation()
      } catch (error) {
        const isLastAttempt = attempt === attempts
        logger.warn({
          err: error,
          operation: operationName,
          attempt
        }, 'PayWay request failed')

        if (isLastAttempt) {
          throw error
        }

        await new Promise((resolve) => setTimeout(resolve, attempt * 500))
      }
    }

    throw new Error(`PayWay ${operationName} failed`)
  }

  private toPaymentSummary(payment: Payment & { _id?: unknown; id?: string }): PaymentSummary {
    return {
      id: payment.id ?? String(payment._id),
      orderId: payment.orderId,
      tranId: payment.tranId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString()
    }
  }
}
