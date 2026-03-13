import { Model, Schema, model, models } from 'mongoose'

export interface User {
  email: string
  passwordHash: string
  tokenVersion: number
  createdAt: Date
  updatedAt: Date
}

const userSchema = new Schema<User>({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
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
