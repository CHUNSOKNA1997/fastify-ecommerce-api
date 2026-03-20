import { Types } from 'mongoose'
import { PaymentModel } from './payment.model'

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

  async markAsPaid(tranId: string, payload?: Record<string, unknown>) {
    return PaymentModel.findOneAndUpdate(
      { tranId },
      {
        status: 'PAID',
        paywayResponse: payload
      },
      { new: true }
    )
  }

  async markAsFailed(tranId: string, payload?: Record<string, unknown>) {
    return PaymentModel.findOneAndUpdate(
      { tranId },
      {
        status: 'FAILED',
        paywayResponse: payload
      },
      { new: true }
    )
  }
}
