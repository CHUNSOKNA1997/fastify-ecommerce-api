import axios from 'axios'
import type { FastifyBaseLogger } from 'fastify'
import { PaymentRepository } from './payment.repository'
import type { Payment } from './payment.model'
import {
  buildRequestTime,
  encodeBase64Value,
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
  PaywayPurchaseRequest,
  PaymentSummary
} from './payway.types'

type PaywayConfig = {
  apiKey: string
  merchantId: string
  purchaseUrl: string
  transactionDetailUrl: string
  returnUrl?: string
  cancelUrl?: string
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
    const existingPayment = await this.repo.findByOrderId(normalizedOrderId)
    if (existingPayment?.status === 'SUCCESS') {
      throw new Error('Payment already completed for this order')
    }

    const tranId = generateTransactionId()
    const request = this.buildPurchaseRequest({
      amount: Number(input.amount.toFixed(2)),
      orderId: normalizedOrderId,
      tranId,
      baseUrl,
      config
    })

    const payment = existingPayment
      ? await this.repo.updatePendingPaymentByOrderId(normalizedOrderId, {
        tranId,
        amount: request.amount,
        currency: request.currency,
        purchaseRequest: request
      })
      : await this.repo.create({
        orderId: normalizedOrderId,
        tranId,
        amount: request.amount,
        currency: request.currency
      })

    if (!payment) {
      throw new Error('Unable to create payment')
    }

    await this.repo.recordPurchaseRequest(payment.id, request)
    await this.repo.appendLog(payment.id, {
      event: 'CHECKOUT_CREATED',
      timestamp: new Date().toISOString(),
      details: {
        amount: request.amount,
        orderId: normalizedOrderId,
        tranId
      }
    })

    try {
      const hostedCheckoutHtml = await this.fetchHostedCheckoutHtml(request, config, logger)
      const storedPayment = await this.repo.storeCheckoutHtml(payment.id, hostedCheckoutHtml)

      if (!storedPayment) {
        throw new Error('Unable to persist hosted checkout HTML')
      }

      await this.repo.appendLog(storedPayment.id, {
        event: 'CHECKOUT_HTML_STORED',
        timestamp: new Date().toISOString(),
        details: {
          tranId
        }
      })

      return {
        payment: this.toPaymentSummary(storedPayment),
        checkoutUrl: `${baseUrl}/api/payments/checkout/${storedPayment.id}`
      }
    } catch (error) {
      const serializedError = this.serializeProviderError(error)
      await this.repo.markStatus(payment.id, 'FAILED', {
        error: serializedError
      })
      await this.repo.appendLog(payment.id, {
        event: 'CHECKOUT_CREATION_FAILED',
        timestamp: new Date().toISOString(),
        details: serializedError
      })
      throw error
    }
  }

  async getCheckoutPage(paymentId: string): Promise<PaywayCheckoutPageResult> {
    const payment = await this.repo.findById(paymentId)
    if (!payment) {
      throw new Error('Payment not found')
    }

    const html = payment.payway?.checkoutHtml
    if (!html) {
      throw new Error('Hosted checkout is not available')
    }

    return { html }
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
      throw new Error('Invalid PayWay webhook signature')
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
    const returnUrl = input.config.returnUrl ?? `${input.baseUrl}/api/payments/return`
    const cancelUrl = input.config.cancelUrl ?? `${input.baseUrl}/api/payments/cancel`

    return {
      req_time: buildRequestTime(),
      merchant_id: input.config.merchantId,
      tran_id: input.tranId,
      amount: input.amount,
      type: 'purchase',
      currency: 'USD',
      return_params: input.orderId,
      return_url: encodeBase64Value(returnUrl),
      cancel_url: cancelUrl
    }
  }

  private async fetchHostedCheckoutHtml(
    request: PaywayPurchaseRequest,
    config: PaywayConfig,
    logger: FastifyBaseLogger
  ): Promise<string> {
    const payload = {
      ...request,
      hash: generatePurchaseHash(request, config.apiKey)
    }

    const response = await this.withRetry(
      async () => axios.postForm<string>(config.purchaseUrl, payload, {
        responseType: 'text',
        timeout: 15000,
        headers: {
          Accept: 'text/html'
        }
      }),
      logger,
      'purchase'
    )

    if (typeof response.data !== 'string' || !response.data.includes('<html')) {
      throw new Error('PayWay purchase API did not return hosted checkout HTML')
    }

    return response.data
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
      transactionDetailUrl:
        process.env.PAYWAY_CHECK_TRANSACTION_URL?.trim() ||
        'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/check-transaction-2',
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
    return value || undefined
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

  private serializeProviderError(error: unknown): Record<string, unknown> {
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
