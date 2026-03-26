import { Types } from 'mongoose'
import { WishlistModel } from './wishlist.model'

export type WishlistItemInput = {
  productId: string
  name: string
  description: string
  price: number
  category: string
  imagePath: string
  rating: number
}

function toObjectId(userId: string | Types.ObjectId) {
  return typeof userId === 'string' ? new Types.ObjectId(userId) : userId
}

export async function findOrCreateWishlistByUserId(userId: string | Types.ObjectId) {
  const normalizedUserId = toObjectId(userId)

  let wishlist = await WishlistModel.findOne({ userId: normalizedUserId })
  if (!wishlist) {
    wishlist = await WishlistModel.create({
      userId: normalizedUserId,
      items: []
    })
  }

  return wishlist
}

export async function addWishlistItem(userId: string | Types.ObjectId, item: WishlistItemInput) {
  const wishlist = await findOrCreateWishlistByUserId(userId)
  const exists = wishlist.items.some((wishlistItem) => wishlistItem.productId === item.productId)

  if (!exists) {
    wishlist.items.push(item)
    await wishlist.save()
  }

  return wishlist
}

export async function removeWishlistItem(userId: string | Types.ObjectId, productId: string) {
  const wishlist = await findOrCreateWishlistByUserId(userId)
  const originalCount = wishlist.items.length

  wishlist.items = wishlist.items.filter((item) => item.productId !== productId)
  if (wishlist.items.length === originalCount) {
    return null
  }

  await wishlist.save()
  return wishlist
}
