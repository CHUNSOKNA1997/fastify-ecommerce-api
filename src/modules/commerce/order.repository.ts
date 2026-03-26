import { Types } from 'mongoose'
import { OrderModel } from './order.model'

export type OrderCreateInput = {
  userId: string | Types.ObjectId
  items: Array<{
    productId: string
    name: string
    category: string
    imagePath: string
    unitPrice: number
    quantity: number
  }>
  subTotal: number
  vat: number
  deliveryFee: number
  total: number
}

function toObjectId(userId: string | Types.ObjectId) {
  return typeof userId === 'string' ? new Types.ObjectId(userId) : userId
}

export async function createOrder(input: OrderCreateInput) {
  return OrderModel.create({
    userId: toObjectId(input.userId),
    items: input.items,
    subTotal: input.subTotal,
    vat: input.vat,
    deliveryFee: input.deliveryFee,
    total: input.total,
    status: 'PENDING'
  })
}

export async function listOrdersByUserId(userId: string | Types.ObjectId) {
  return OrderModel.find({ userId: toObjectId(userId) }).sort({ createdAt: -1 })
}
