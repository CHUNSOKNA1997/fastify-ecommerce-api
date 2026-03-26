import axios from 'axios'
import {
  buildPaywayHashValues,
  encodePaywayUrl,
  generatePaywayHash,
  generatePaywayTransactionId,
  getPaywayRequestTime,
  verifyPaywayCallbackSignature
} from './payway-hash'
import type {
  CreateHostedCheckoutInput,
  PaymentSummary,
  PaywayCallbackPayload,
  PaywayCheckoutData,
  PaywayCheckTransactionResponse,
  PaywayCreatePaymentResult,
  PaywayHostedCheckoutResult,
  PaywayHostedCheckoutSessionResult,
  PaywayPurchaseResponse,
  PaywayPurchaseRequest
} from './payway.types'
import { PaymentRepository } from './payment.repository'
import type { Payment } from './payment.model'

const PAYWAY_PURCHASE_HASH_ORDER: Array<keyof PaywayPurchaseRequest> = [
  'req_time',
  'merchant_id',
  'tran_id',
  'amount',
  'currency',
  'payment_option',
  'return_url',
  'cancel_url',
  'return_params'
]

export class PaymentService {
  private repo = new PaymentRepository()

  async createHostedCheckoutSession(
    userId: string,
    input: CreateHostedCheckoutInput
  ): Promise<PaywayHostedCheckoutSessionResult> {
    const { payment } = await this.preparePurchase(userId, input)

    return {
      payment: this.toPaymentSummary(payment)
    }
  }

  async createHostedCheckout(
    userId: string,
    input: CreateHostedCheckoutInput
  ): Promise<PaywayHostedCheckoutResult> {
    const { payment, requestData, config } = await this.preparePurchase(userId, input)
    const hash = generatePaywayHash(
      buildPaywayHashValues(requestData, PAYWAY_PURCHASE_HASH_ORDER),
      config.apiKey
    )
    const checkoutHtml = this.renderHostedCheckoutPage(config.purchaseUrl, {
      ...requestData,
      hash
    })

    return {
      payment: this.toPaymentSummary(payment),
      checkoutHtml,
      checkoutPayload: {
        ...requestData,
        hash,
        actionUrl: config.purchaseUrl
      }
    }
  }

  async getHostedCheckoutForUser(userId: string, tranId: string): Promise<PaywayHostedCheckoutResult> {
    const payment = await this.repo.findByTranIdForUser(tranId, userId)
    if (!payment) {
      throw new Error('Payment not found')
    }

    const requestData = payment.paywayResponse?.purchaseRequest
    if (!requestData) {
      throw new Error('Hosted checkout request is not available')
    }

    const config = this.getConfig()
    const hash = generatePaywayHash(
      buildPaywayHashValues(requestData, PAYWAY_PURCHASE_HASH_ORDER),
      config.apiKey
    )
    const checkoutHtml = this.renderHostedCheckoutPage(config.purchaseUrl, {
      ...requestData,
      hash
    })

    return {
      payment: this.toPaymentSummary(payment),
      checkoutHtml,
      checkoutPayload: {
        ...requestData,
        hash,
        actionUrl: config.purchaseUrl
      }
    }
  }

  async createPayment(userId: string, amount: number): Promise<PaywayCreatePaymentResult> {
    const { payment, requestData, config } = await this.preparePurchase(userId, { amount })

    try {
      const res = await axios.postForm(config.purchaseUrl, {
        ...requestData,
        hash: generatePaywayHash(
          buildPaywayHashValues(requestData, PAYWAY_PURCHASE_HASH_ORDER),
          config.apiKey
        )
      })
      const providerResponse = res.data as PaywayPurchaseResponse

      const storedPayment = await this.repo.recordPurchaseInitiation(payment.tranId, providerResponse)

      return {
        payment: this.toPaymentSummary(storedPayment ?? payment),
        checkout: this.toCheckoutData(providerResponse),
        providerResponse
      }
    } catch (error) {
      await this.repo.markAsFailed(payment.tranId, {
        error: this.serializeProviderError(error)
      })
      throw error
    }
  }

  async handleCallback(payload: PaywayCallbackPayload) {
    const tranId = String(payload.tran_id ?? '').trim()
    if (tranId.length === 0) {
      throw new Error('tran_id is required')
    }

    const payment = await this.repo.findByTranId(tranId)
    if (!payment) throw new Error('Payment not found')

    if (payment.status === 'PAID') {
      return payment
    }

    const verification = await this.checkTransaction(tranId)
    const providerStatusCode = String(verification.status?.code ?? '')
    const paymentStatusCode = Number(verification.data?.payment_status_code)
    const verifiedAmount = Number(verification.data?.total_amount)
    const verifiedCurrency = String(verification.data?.payment_currency ?? '')
    const matchesAmount = Number.isFinite(verifiedAmount) && verifiedAmount === payment.amount
    const matchesCurrency = verifiedCurrency.length === 0 || verifiedCurrency === payment.currency
    const isPaid =
      providerStatusCode === '00' &&
      paymentStatusCode === 0 &&
      matchesAmount &&
      matchesCurrency

    if (isPaid) {
      return this.repo.markAsPaid(tranId, {
        callback: payload,
        verification
      })
    }

    return this.repo.markAsFailed(tranId, {
      callback: payload,
      verification
    })
  }

  verifyCallbackSignature(payload: Record<string, unknown>, signature: string): boolean {
    return verifyPaywayCallbackSignature(payload, this.getConfig().apiKey, signature)
  }

  async getPaymentStatusForUser(userId: string, tranId: string) {
    const payment = await this.repo.findByTranIdForUser(tranId, userId)
    if (!payment) {
      throw new Error('Payment not found')
    }

    return {
      payment: this.toPaymentSummary(payment),
      provider: {
        purchaseStatusCode: payment.paywayResponse?.purchase?.status?.code,
        purchaseStatusMessage: payment.paywayResponse?.purchase?.status?.message,
        verificationStatusCode: payment.paywayResponse?.verification?.status?.code,
        verificationStatusMessage: payment.paywayResponse?.verification?.status?.message,
        paymentStatus: payment.paywayResponse?.verification?.data?.payment_status,
        paymentStatusCode: payment.paywayResponse?.verification?.data?.payment_status_code
      }
    }
  }

  private async preparePurchase(userId: string, input: CreateHostedCheckoutInput) {
    const amount = input.amount
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('amount must be a positive number')
    }

    const config = this.getConfig()
    const tranId = generatePaywayTransactionId()
    const currency = input.currency?.trim() || 'USD'
    const requestData: PaywayPurchaseRequest = {
      req_time: getPaywayRequestTime(),
      merchant_id: config.merchantId,
      tran_id: tranId,
      amount,
      currency
    }

    const normalizedPhone = input.phone?.trim()
    if (normalizedPhone) {
      requestData.phone = normalizedPhone
    }

    const normalizedPaymentOption = input.paymentOption?.trim()
    if (normalizedPaymentOption) {
      requestData.payment_option = normalizedPaymentOption
    }

    const normalizedReturnParams = input.returnParams?.trim()
    if (normalizedReturnParams) {
      requestData.return_params = normalizedReturnParams
    }

    if (config.returnUrl) {
      requestData.return_url = encodePaywayUrl(config.returnUrl)
    }

    if (config.cancelUrl) {
      requestData.cancel_url = encodePaywayUrl(config.cancelUrl)
    }

    const payment = await this.repo.create({
      userId,
      tranId,
      amount,
      currency: requestData.currency
    })

    const storedPayment = await this.repo.recordPurchaseRequest(
      tranId,
      requestData as unknown as Record<string, unknown>
    )

    return {
      config,
      payment: storedPayment ?? payment,
      requestData
    }
  }

  private async checkTransaction(tranId: string): Promise<PaywayCheckTransactionResponse> {
    const config = this.getConfig()
    const requestTime = getPaywayRequestTime()
    const payload = {
      req_time: requestTime,
      merchant_id: config.merchantId,
      tran_id: tranId
    }
    const checkTransactionHashValues = buildPaywayHashValues(payload, [
      'req_time',
      'merchant_id',
      'tran_id'
    ])

    const response = await axios.postForm(
      config.checkTransactionUrl,
      {
        ...payload,
        hash: generatePaywayHash(checkTransactionHashValues, config.apiKey)
      }
    )

    return response.data as PaywayCheckTransactionResponse
  }

  private getConfig() {
    return {
      apiKey: this.getRequiredEnv('PAYWAY_API_KEY'),
      merchantId: this.getRequiredEnv('PAYWAY_MERCHANT_ID'),
      purchaseUrl:
        process.env.PAYWAY_PURCHASE_URL ??
        process.env.PAYWAY_API_URL ??
        'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase',
      checkTransactionUrl:
        process.env.PAYWAY_CHECK_TRANSACTION_URL ??
        'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/transaction-detail',
      returnUrl: this.getOptionalEnv('PAYWAY_RETURN_URL'),
      cancelUrl: this.getOptionalEnv('PAYWAY_CANCEL_URL')
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

    if (!value) {
      return undefined
    }

    return value
  }

  private serializeProviderError(error: unknown) {
    if (axios.isAxiosError(error)) {
      return {
        code: error.code,
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      }
    }

    if (error instanceof Error) {
      return {
        message: error.message
      }
    }

    return {
      message: 'Unknown PayWay error'
    }
  }

  private renderHostedCheckoutPage(actionUrl: string, fields: Record<string, unknown>) {
    const hiddenInputs = Object.entries(fields)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => {
        return `<input type="hidden" name="${this.escapeHtml(key)}" value="${this.escapeHtml(String(value))}" />`
      })
      .join('\n          ')

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Redirecting to PayWay Checkout</title>
  </head>
  <body>
    <form method="POST" id="payway_checkout_form" action="${this.escapeHtml(actionUrl)}">
          ${hiddenInputs}
      <noscript>
        <button type="submit">Continue to PayWay Checkout</button>
      </noscript>
    </form>
    <script>
      document.getElementById('payway_checkout_form').submit();
    </script>
  </body>
</html>`
  }

  private escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }

  private toCheckoutData(providerResponse: PaywayPurchaseResponse): PaywayCheckoutData {
    return {
      kind: 'qr',
      qrString: typeof providerResponse.qrString === 'string' ? providerResponse.qrString : undefined,
      qrImage: typeof providerResponse.qrImage === 'string' ? providerResponse.qrImage : undefined,
      deepLink:
        typeof providerResponse.abapay_deeplink === 'string'
          ? providerResponse.abapay_deeplink
          : undefined,
      appStoreUrl:
        typeof providerResponse.app_store === 'string' ? providerResponse.app_store : undefined,
      playStoreUrl:
        typeof providerResponse.play_store === 'string' ? providerResponse.play_store : undefined,
      providerMessage:
        typeof providerResponse.status?.message === 'string'
          ? providerResponse.status.message
          : undefined
    }
  }

  private toPaymentSummary(payment: Payment & { _id?: unknown; id?: string }): PaymentSummary {
    return {
      id: payment.id ?? String(payment._id),
      tranId: payment.tranId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString()
    }
  }
}
