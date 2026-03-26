import { Model, Schema, Types, model, models } from 'mongoose'

export interface CartItem {
  _id?: Types.ObjectId
  productId: string
  name: string
  category: string
  imagePath: string
  unitPrice: number
  quantity: number
}

export interface Cart {
  userId: Types.ObjectId
  items: CartItem[]
  createdAt: Date
  updatedAt: Date
}

const cartItemSchema = new Schema<CartItem>({
  productId: {
    type: String,
    required: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  imagePath: {
    type: String,
    required: true,
    trim: true
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  }
}, {
  _id: true
})

const cartSchema = new Schema<Cart>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: {
    type: [cartItemSchema],
    default: []
  }
}, {
  timestamps: true
})

export const CartModel: Model<Cart> =
  models.Cart as Model<Cart> || model<Cart>('Cart', cartSchema)
