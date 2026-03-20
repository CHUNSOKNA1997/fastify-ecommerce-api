import axios from 'axios'
import {
  generatePaywayHash,
  generatePaywayTransactionId,
  getPaywayRequestTime
} from './payway-hash'
import type {
  PaywayCallbackPayload,
  PaywayCheckTransactionResponse,
  PaywayCreatePaymentResult,
  PaywayPurchaseRequest
} from './payway.types'
import { PaymentRepository } from './payment.repository'

export class PaymentService {
  private repo = new PaymentRepository()

  async createPayment(userId: string, amount: number): Promise<PaywayCreatePaymentResult> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('amount must be a positive number')
    }

    const config = this.getConfig()
    const tranId = generatePaywayTransactionId()

    const data: PaywayPurchaseRequest = {
      req_time: getPaywayRequestTime(),
      merchant_id: config.merchantId,
      tran_id: tranId,
      amount,
      currency: 'USD',
      return_url: config.returnUrl,
      cancel_url: config.cancelUrl
    }

    const payment = await this.repo.create({
      userId,
      tranId,
      amount,
      currency: data.currency
    })

    try {
      const res = await axios.postForm(config.purchaseUrl, {
        ...data,
        hash: generatePaywayHash(data, config.apiKey)
      })

      return {
        payment,
        checkoutHtml: typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
      }
    } catch (error) {
      await this.repo.markAsFailed(tranId, this.serializeProviderError(error))
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

  private async checkTransaction(tranId: string): Promise<PaywayCheckTransactionResponse> {
    const config = this.getConfig()
    const requestTime = getPaywayRequestTime()
    const payload = {
      req_time: requestTime,
      merchant_id: config.merchantId,
      tran_id: tranId
    }

    const response = await axios.post(
      config.checkTransactionUrl,
      {
        ...payload,
        hash: generatePaywayHash(payload, config.apiKey)
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
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
        'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase',
      checkTransactionUrl:
        process.env.PAYWAY_CHECK_TRANSACTION_URL ??
        'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/transaction-detail',
      returnUrl: this.getRequiredEnv('PAYWAY_RETURN_URL'),
      cancelUrl: this.getRequiredEnv('PAYWAY_CANCEL_URL')
    }
  }

  private getRequiredEnv(name: string): string {
    const value = process.env[name]?.trim()
    if (!value) {
      throw new Error(`${name} is required`)
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
}
