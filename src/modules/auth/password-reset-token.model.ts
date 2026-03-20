import { Model, Schema, model, models } from 'mongoose'

export interface PasswordResetToken {
  userId: string
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const passwordResetTokenSchema = new Schema<PasswordResetToken>({
  userId: {
    type: String,
    required: true,
    index: true
  },
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  usedAt: {
    type: Date,
    default: null,
    index: true
  }
}, {
  timestamps: true
})

export const PasswordResetTokenModel: Model<PasswordResetToken> =
  models.PasswordResetToken as Model<PasswordResetToken> ||
  model<PasswordResetToken>('PasswordResetToken', passwordResetTokenSchema)
