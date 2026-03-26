import { Types } from 'mongoose'
import { PaymentModel } from './payment.model'
import type {
  PaywayCallbackPayload,
  PaywayCheckTransactionResponse,
  PaywayPurchaseResponse
} from './payway.types'

export class PaymentRepository {
  async create(data: {
    userId: string | Types.ObjectId
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

  async findByTranId(tranId: string) {
    return PaymentModel.findOne({ tranId })
  }

  async findByTranIdForUser(tranId: string, userId: string | Types.ObjectId) {
    return PaymentModel.findOne({ tranId, userId })
  }

  async recordPurchaseInitiation(tranId: string, purchase: PaywayPurchaseResponse) {
    return PaymentModel.findOneAndUpdate(
      { tranId },
      {
        $set: {
          'paywayResponse.purchase': purchase
        }
      },
      { new: true }
    )
  }

  async recordPurchaseRequest(tranId: string, purchaseRequest: Record<string, unknown>) {
    return PaymentModel.findOneAndUpdate(
      { tranId },
      {
        $set: {
          'paywayResponse.purchaseRequest': purchaseRequest
        }
      },
      { new: true }
    )
  }

  async markAsPaid(
    tranId: string,
    payload: {
      callback: PaywayCallbackPayload
      verification: PaywayCheckTransactionResponse
    }
  ) {
    return PaymentModel.findOneAndUpdate(
      { tranId },
      {
        $set: {
          status: 'PAID',
          'paywayResponse.callback': payload.callback,
          'paywayResponse.verification': payload.verification
        },
        $unset: {
          'paywayResponse.lastError': 1
        }
      },
      { new: true }
    )
  }

  async markAsFailed(
    tranId: string,
    payload: {
      callback?: PaywayCallbackPayload
      verification?: PaywayCheckTransactionResponse
      error?: Record<string, unknown>
    }
  ) {
    return PaymentModel.findOneAndUpdate(
      { tranId },
      {
        $set: {
          status: 'FAILED',
          ...(payload.callback ? { 'paywayResponse.callback': payload.callback } : {}),
          ...(payload.verification ? { 'paywayResponse.verification': payload.verification } : {}),
          ...(payload.error ? { 'paywayResponse.lastError': payload.error } : {})
        }
      },
      { new: true }
    )
  }
}
