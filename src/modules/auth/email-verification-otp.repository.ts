import { createHash, randomInt } from 'node:crypto'
import { HydratedDocument } from 'mongoose'
import { EmailVerificationOtp, EmailVerificationOtpModel } from './email-verification-otp.model'

const MAX_VERIFY_ATTEMPTS = 5

export interface EmailVerificationOtpRecord {
  id: string
  userId: string
  email: string
  codeHash: string
  expiresAt: Date
  usedAt: Date | null
  attemptCount: number
}

export interface IssuedEmailVerificationOtp {
  code: string
  record: EmailVerificationOtpRecord
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function toEmailVerificationOtpRecord(record: HydratedDocument<EmailVerificationOtp>): EmailVerificationOtpRecord {
  return {
    id: record.id,
    userId: record.userId,
    email: record.email,
    codeHash: record.codeHash,
    expiresAt: record.expiresAt,
    usedAt: record.usedAt,
    attemptCount: record.attemptCount
  }
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export async function issueEmailVerificationOtp(
  userId: string,
  email: string,
  ttlMinutes: number
): Promise<IssuedEmailVerificationOtp> {
  const code = generateOtpCode()
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000)
  const record = await EmailVerificationOtpModel.create({
    userId,
    email: normalizeEmail(email),
    codeHash: hashCode(code),
    expiresAt
  })

  return {
    code,
    record: toEmailVerificationOtpRecord(record)
  }
}

export async function findLatestActiveEmailVerificationOtp(email: string): Promise<EmailVerificationOtpRecord | null> {
  const record = await EmailVerificationOtpModel.findOne({
    email: normalizeEmail(email),
    usedAt: null
  }).sort({ createdAt: -1 })

  if (!record) {
    return null
  }

  return toEmailVerificationOtpRecord(record)
}

export function isEmailVerificationOtpCodeValid(code: string, record: EmailVerificationOtpRecord): boolean {
  return hashCode(code.trim()) === record.codeHash
}

export function hasEmailVerificationOtpExceededAttempts(record: EmailVerificationOtpRecord): boolean {
  return record.attemptCount >= MAX_VERIFY_ATTEMPTS
}

export async function incrementEmailVerificationOtpAttemptCount(id: string): Promise<void> {
  await EmailVerificationOtpModel.updateOne(
    { _id: id },
    { $inc: { attemptCount: 1 } }
  )
}

export async function markEmailVerificationOtpUsed(id: string): Promise<void> {
  await EmailVerificationOtpModel.updateOne(
    { _id: id },
    { $set: { usedAt: new Date() } }
  )
}

export async function revokeAllEmailVerificationOtpsForUser(userId: string): Promise<void> {
  await EmailVerificationOtpModel.updateMany(
    { userId, usedAt: null },
    { $set: { usedAt: new Date() } }
  )
}
