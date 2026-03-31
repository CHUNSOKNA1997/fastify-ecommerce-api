import { Model, Schema, model, models } from 'mongoose'

export interface Product {
  name: string
  description: string
  price: number
  category: string
  imagePath: string
  rating: number
  isFavorite: boolean
  isNewArrival: boolean
  isTrending: boolean
  isPopularNearYou: boolean
  createdAt: Date
  updatedAt: Date
}

const productSchema = new Schema<Product>({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
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
  rating: {
    type: Number,
    required: true,
    min: 0,
    max: 5,
    default: 0
  },
  isFavorite: {
    type: Boolean,
    required: true,
    default: false
  },
  isNewArrival: {
    type: Boolean,
    required: true,
    default: false
  },
  isTrending: {
    type: Boolean,
    required: true,
    default: false
  },
  isPopularNearYou: {
    type: Boolean,
    required: true,
    default: false
  }
}, {
  timestamps: true
})

export const ProductModel: Model<Product> =
  models.Product as Model<Product> || model<Product>('Product', productSchema)
