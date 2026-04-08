import { Types } from 'mongoose'
import { PaymentModel } from './payment.model'
import type {
  PaywayCallbackPayload,
  PaywayCheckTransactionResponse,
  PaywayLogEntry,
  PaywayPurchaseRequest,
  PaymentStatus
} from './payway.types'

export class PaymentRepository {
  async create(data: {
    userId?: string | Types.ObjectId
    orderId: string
    tranId: string
    amount: number
    currency?: string
  }) {
    return PaymentModel.create({
      ...data,
      status: 'PENDING',
      currency: data.currency || 'USD'
    })
  }

  async findById(id: string) {
    return PaymentModel.findById(id)
  }

  async findByOrderId(orderId: string) {
    return PaymentModel.findOne({ orderId })
  }

  async findByTranId(tranId: string) {
    return PaymentModel.findOne({ tranId })
  }

  async updatePendingPaymentByOrderId(orderId: string, data: {
    tranId: string
    amount: number
    currency: string
    purchaseRequest: PaywayPurchaseRequest
    checkoutExpiresAt: string
  }) {
    return PaymentModel.findOneAndUpdate(
      { orderId },
      {
        $set: {
          tranId: data.tranId,
          amount: data.amount,
          currency: data.currency,
          status: 'PENDING',
          'payway.purchaseRequest': data.purchaseRequest,
          'payway.checkoutExpiresAt': data.checkoutExpiresAt,
          'payway.checkoutHtml': null,
          'payway.callback': null,
          'payway.verification': null,
          'payway.lastError': null
        }
      },
      { new: true }
    )
  }

  async storeCheckoutHtml(paymentId: string, html: string) {
    return PaymentModel.findByIdAndUpdate(
      paymentId,
      {
        $set: {
          'payway.checkoutHtml': html
        },
        $unset: {
          'payway.lastError': 1
        }
      },
      { new: true }
    )
  }

  async recordPurchaseRequest(paymentId: string, purchaseRequest: PaywayPurchaseRequest, checkoutExpiresAt: string) {
    return PaymentModel.findByIdAndUpdate(
      paymentId,
      {
        $set: {
          'payway.purchaseRequest': purchaseRequest,
          'payway.checkoutExpiresAt': checkoutExpiresAt
        }
      },
      { new: true }
    )
  }

  async markStatus(
    paymentId: string,
    status: PaymentStatus,
    payload: {
      callback?: PaywayCallbackPayload
      verification?: PaywayCheckTransactionResponse
      error?: Record<string, unknown>
    }
  ) {
    return PaymentModel.findOneAndUpdate(
      { _id: paymentId },
      {
        $set: {
          status,
          ...(payload.callback ? { 'payway.callback': payload.callback } : {}),
          ...(payload.verification ? { 'payway.verification': payload.verification } : {}),
          ...(payload.error ? { 'payway.lastError': payload.error } : {})
        }
      },
      { new: true }
    )
  }

  async appendLog(paymentId: string, log: PaywayLogEntry) {
    return PaymentModel.findByIdAndUpdate(
      paymentId,
      {
        $push: {
          'payway.logs': log
        }
      },
      { new: true }
    )
  }

  async markConfirmationEmailSent(paymentId: string, sentAt: string) {
    return PaymentModel.findByIdAndUpdate(
      paymentId,
      {
        $set: {
          'payway.confirmationEmailSentAt': sentAt
        }
      },
      { new: true }
    )
  }
}
