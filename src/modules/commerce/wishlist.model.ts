import { Model, Schema, Types, model, models } from 'mongoose'

export interface WishlistItem {
  productId: string
  name: string
  description: string
  price: number
  category: string
  imagePath: string
  rating: number
}

export interface Wishlist {
  userId: Types.ObjectId
  items: WishlistItem[]
  createdAt: Date
  updatedAt: Date
}

const wishlistItemSchema = new Schema<WishlistItem>({
  productId: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  category: { type: String, required: true, trim: true },
  imagePath: { type: String, required: true, trim: true },
  rating: { type: Number, required: true, min: 0, max: 5 }
}, {
  _id: false
})

const wishlistSchema = new Schema<Wishlist>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: {
    type: [wishlistItemSchema],
    default: []
  }
}, {
  timestamps: true
})

export const WishlistModel: Model<Wishlist> =
  models.Wishlist as Model<Wishlist> || model<Wishlist>('Wishlist', wishlistSchema)
