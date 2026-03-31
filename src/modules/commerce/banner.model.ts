import { Model, Schema, model, models } from 'mongoose'

export interface Banner {
  title: string
  subtitle: string
  discountLabel?: string
  actionLabel: string
  imagePath: string
  backgroundColor: string
  accentColor?: string
  textColor?: string
  isActive: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

const bannerSchema = new Schema<Banner>({
  title: {
    type: String,
    required: true,
    trim: true
  },
  subtitle: {
    type: String,
    required: true,
    trim: true
  },
  discountLabel: {
    type: String,
    trim: true
  },
  actionLabel: {
    type: String,
    required: true,
    trim: true
  },
  imagePath: {
    type: String,
    required: true,
    trim: true
  },
  backgroundColor: {
    type: String,
    required: true,
    trim: true
  },
  accentColor: {
    type: String,
    trim: true
  },
  textColor: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    required: true,
    default: true
  },
  sortOrder: {
    type: Number,
    required: true,
    default: 0
  }
}, {
  timestamps: true
})

export const BannerModel: Model<Banner> =
  models.Banner as Model<Banner> || model<Banner>('Banner', bannerSchema)
