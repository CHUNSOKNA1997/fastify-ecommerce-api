import { Model, Schema, model, models, Types } from 'mongoose'

export interface Payment {
  userId: Types.ObjectId
  tranId: string
  amount: number
  currency: string
  status: 'PENDING' | 'PAID' | 'FAILED'
  paymentMethod?: string
  paywayResponse?: any
  createdAt: Date
  updatedAt: Date
}

const paymentSchema = new Schema<Payment>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
    enum: ['PENDING', 'PAID', 'FAILED'],
    default: 'PENDING'
  },
  paymentMethod: {
    type: String
  },
  paywayResponse: {
    type: Schema.Types.Mixed
  }
}, {
  timestamps: true
})

export const PaymentModel: Model<Payment> =
  models.Payment as Model<Payment> || model<Payment>('Payment', paymentSchema)