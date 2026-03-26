import { Types } from 'mongoose'
import { CartModel } from './cart.model'

export type CartItemInput = {
  productId: string
  name: string
  category: string
  imagePath: string
  unitPrice: number
  quantity: number
}

function toObjectId(userId: string | Types.ObjectId) {
  return typeof userId === 'string' ? new Types.ObjectId(userId) : userId
}

export async function findOrCreateCartByUserId(userId: string | Types.ObjectId) {
  const normalizedUserId = toObjectId(userId)

  let cart = await CartModel.findOne({ userId: normalizedUserId })
  if (!cart) {
    cart = await CartModel.create({
      userId: normalizedUserId,
      items: []
    })
  }

  return cart
}

export async function addCartItem(userId: string | Types.ObjectId, item: CartItemInput) {
  const cart = await findOrCreateCartByUserId(userId)
  const existingItem = cart.items.find((cartItem) => cartItem.productId === item.productId)

  if (existingItem) {
    existingItem.quantity += item.quantity
    existingItem.unitPrice = item.unitPrice
    existingItem.name = item.name
    existingItem.category = item.category
    existingItem.imagePath = item.imagePath
  } else {
    cart.items.push(item)
  }

  await cart.save()
  return cart
}

export async function updateCartItemQuantity(
  userId: string | Types.ObjectId,
  itemId: string,
  quantity: number
) {
  const cart = await findOrCreateCartByUserId(userId)
  const item = cart.items.find((cartItem) => String(cartItem._id) === itemId)

  if (!item) {
    return null
  }

  item.quantity = quantity
  await cart.save()

  return cart
}

export async function removeCartItem(userId: string | Types.ObjectId, itemId: string) {
  const cart = await findOrCreateCartByUserId(userId)
  const item = cart.items.find((cartItem) => String(cartItem._id) === itemId)

  if (!item) {
    return null
  }

  cart.items = cart.items.filter((cartItem) => String(cartItem._id) !== itemId)
  await cart.save()

  return cart
}

export async function clearCart(userId: string | Types.ObjectId) {
  const cart = await findOrCreateCartByUserId(userId)
  cart.items = []
  await cart.save()

  return cart
}
