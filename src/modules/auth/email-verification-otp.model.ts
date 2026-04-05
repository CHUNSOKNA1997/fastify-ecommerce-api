import { Model, Schema, model, models } from 'mongoose'

export interface EmailVerificationOtp {
  userId: string
  email: string
  codeHash: string
  expiresAt: Date
  usedAt: Date | null
  attemptCount: number
  createdAt: Date
  updatedAt: Date
}

const emailVerificationOtpSchema = new Schema<EmailVerificationOtp>({
  userId: {
    type: String,
    required: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true
  },
  codeHash: {
    type: String,
    required: true,
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
  },
  attemptCount: {
    type: Number,
    required: true,
    default: 0
  }
}, {
  timestamps: true
})

export const EmailVerificationOtpModel: Model<EmailVerificationOtp> =
  models.EmailVerificationOtp as Model<EmailVerificationOtp> ||
  model<EmailVerificationOtp>('EmailVerificationOtp', emailVerificationOtpSchema)
