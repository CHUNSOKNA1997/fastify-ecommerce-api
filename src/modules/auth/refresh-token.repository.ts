import { randomBytes, createHash } from 'node:crypto'
import { HydratedDocument } from 'mongoose'
import { RefreshToken, RefreshTokenModel } from './refresh-token.model'

export interface RefreshTokenRecord {
  id: string
  userId: string
  tokenVersion: number
  tokenHash: string
  expiresAt: Date
  revokedAt: Date | null
  replacedByTokenId: string | null
}

export interface IssuedRefreshToken {
  token: string
  record: RefreshTokenRecord
}

function toRefreshTokenRecord(token: HydratedDocument<RefreshToken>): RefreshTokenRecord {
  return {
    id: token.id,
    userId: token.userId,
    tokenVersion: token.tokenVersion,
    tokenHash: token.tokenHash,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    replacedByTokenId: token.replacedByTokenId
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function createOpaqueToken(): string {
  return randomBytes(48).toString('base64url')
}

export async function issueRefreshToken(userId: string, tokenVersion: number, ttlDays: number): Promise<IssuedRefreshToken> {
  const token = createOpaqueToken()
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000)
  const record = await RefreshTokenModel.create({
    userId,
    tokenVersion,
    tokenHash: hashToken(token),
    expiresAt
  })

  return {
    token,
    record: toRefreshTokenRecord(record)
  }
}

export async function findRefreshToken(token: string): Promise<RefreshTokenRecord | null> {
  const tokenHash = hashToken(token)
  const record = await RefreshTokenModel.findOne({ tokenHash })

  if (!record) {
    return null
  }

  return toRefreshTokenRecord(record)
}

export async function revokeRefreshTokenById(tokenId: string, replacedByTokenId?: string): Promise<void> {
  await RefreshTokenModel.updateOne(
    { _id: tokenId },
    {
      $set: {
        revokedAt: new Date(),
        replacedByTokenId: replacedByTokenId ?? null
      }
    }
  )
}

export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  await RefreshTokenModel.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  )
}
