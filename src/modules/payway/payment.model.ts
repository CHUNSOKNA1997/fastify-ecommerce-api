import { Model, Schema, model, models, Types } from 'mongoose'
import type { PaymentProviderState, PaymentStatus } from './payway.types'

export interface Payment {
  userId?: Types.ObjectId
  orderId: string
  tranId: string
  amount: number
  currency: string
  status: PaymentStatus
  payway?: PaymentProviderState
  createdAt: Date
  updatedAt: Date
}

const paymentSchema = new Schema<Payment>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  orderId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  tranId: {
    type: String,
    required: true,
    unique: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    required: true,
    default: 'USD'
  },
  status: {
    type: String,
    enum: ['PENDING', 'SUCCESS', 'FAILED'],
    default: 'PENDING'
  },
  payway: {
    type: Schema.Types.Mixed
  }
}, {
  timestamps: true
})

export const PaymentModel: Model<Payment> =
  models.Payment as Model<Payment> || model<Payment>('Payment', paymentSchema)
