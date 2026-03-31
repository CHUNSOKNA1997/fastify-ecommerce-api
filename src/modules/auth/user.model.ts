import { Model, Schema, model, models } from 'mongoose'

export const DEFAULT_USER_AVATAR_PATH = '/assets/images/user/user-avatar.png'

export interface User {
  firstName: string
  lastName: string
  email: string
  phone?: string
  avatarPath: string
  passwordHash: string
  tokenVersion: number
  createdAt: Date
  updatedAt: Date
}

const userSchema = new Schema<User>({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    trim: true
  },
  avatarPath: {
    type: String,
    required: true,
    trim: true,
    default: DEFAULT_USER_AVATAR_PATH
  },
  passwordHash: {
    type: String,
    required: true
  },
  tokenVersion: {
    type: Number,
    required: true,
    default: 0
  }
}, {
  timestamps: true
})

export const UserModel: Model<User> = models.User as Model<User> || model<User>('User', userSchema)
