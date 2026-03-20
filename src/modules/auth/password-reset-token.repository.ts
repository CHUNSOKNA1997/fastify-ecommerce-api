import { createHash, randomBytes } from 'node:crypto'
import { HydratedDocument } from 'mongoose'
import { PasswordResetToken, PasswordResetTokenModel } from './password-reset-token.model'

export interface PasswordResetTokenRecord {
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
}

export interface IssuedPasswordResetToken {
  token: string
  record: PasswordResetTokenRecord
}

function toPasswordResetRecord(token: HydratedDocument<PasswordResetToken>): PasswordResetTokenRecord {
  return {
    id: token.id,
    userId: token.userId,
    tokenHash: token.tokenHash,
    expiresAt: token.expiresAt,
    usedAt: token.usedAt
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function createOpaqueToken(): string {
  return randomBytes(48).toString('base64url')
}

export async function issuePasswordResetToken(userId: string, ttlMinutes: number): Promise<IssuedPasswordResetToken> {
  const token = createOpaqueToken()
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000)
  const record = await PasswordResetTokenModel.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt
  })

  return {
    token,
    record: toPasswordResetRecord(record)
  }
}

export async function findPasswordResetToken(token: string): Promise<PasswordResetTokenRecord | null> {
  const tokenHash = hashToken(token)
  const record = await PasswordResetTokenModel.findOne({ tokenHash })

  if (!record) {
    return null
  }

  return toPasswordResetRecord(record)
}

export async function markPasswordResetTokenUsed(tokenId: string): Promise<void> {
  await PasswordResetTokenModel.updateOne(
    { _id: tokenId },
    { $set: { usedAt: new Date() } }
  )
}

export async function revokeAllPasswordResetTokens(userId: string): Promise<void> {
  await PasswordResetTokenModel.updateMany(
    { userId, usedAt: null },
    { $set: { usedAt: new Date() } }
  )
}
