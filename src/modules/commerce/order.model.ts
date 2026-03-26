import { Model, Schema, Types, model, models } from 'mongoose'

export interface OrderItem {
  productId: string
  name: string
  category: string
  imagePath: string
  unitPrice: number
  quantity: number
}

export interface Order {
  userId: Types.ObjectId
  items: OrderItem[]
  subTotal: number
  vat: number
  deliveryFee: number
  total: number
  status: 'PENDING' | 'PAID' | 'CANCELLED'
  createdAt: Date
  updatedAt: Date
}

const orderItemSchema = new Schema<OrderItem>({
  productId: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  imagePath: { type: String, required: true, trim: true },
  unitPrice: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1 }
}, {
  _id: false
})

const orderSchema = new Schema<Order>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: {
    type: [orderItemSchema],
    required: true
  },
  subTotal: {
    type: Number,
    required: true,
    min: 0
  },
  vat: {
    type: Number,
    required: true,
    min: 0
  },
  deliveryFee: {
    type: Number,
    required: true,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['PENDING', 'PAID', 'CANCELLED'],
    default: 'PENDING'
  }
}, {
  timestamps: true
})

export const OrderModel: Model<Order> =
  models.Order as Model<Order> || model<Order>('Order', orderSchema)
