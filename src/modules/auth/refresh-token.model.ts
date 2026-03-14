import { Model, Schema, model, models } from 'mongoose'

export interface RefreshToken {
  userId: string
  tokenVersion: number
  tokenHash: string
  expiresAt: Date
  revokedAt: Date | null
  replacedByTokenId: string | null
  createdAt: Date
  updatedAt: Date
}

const refreshTokenSchema = new Schema<RefreshToken>({
  userId: {
    type: String,
    required: true,
    index: true
  },
  tokenVersion: {
    type: Number,
    required: true
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
  revokedAt: {
    type: Date,
    default: null,
    index: true
  },
  replacedByTokenId: {
    type: String,
    default: null
  }
}, {
  timestamps: true
})

export const RefreshTokenModel: Model<RefreshToken> =
  models.RefreshToken as Model<RefreshToken> || model<RefreshToken>('RefreshToken', refreshTokenSchema)
