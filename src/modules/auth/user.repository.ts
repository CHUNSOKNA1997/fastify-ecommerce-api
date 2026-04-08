import { HydratedDocument } from 'mongoose'
import { getDefaultUserAvatarPath, User, UserModel } from './user.model'

export interface UserRecord {
  id: string
  firstName: string
  lastName: string
  email: string
  isEmailVerified: boolean
  phone?: string
  avatarPath: string
  passwordHash: string
  tokenVersion: number
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function toUserRecord(user: HydratedDocument<User>): UserRecord {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    isEmailVerified: user.isEmailVerified,
    phone: user.phone,
    avatarPath: user.avatarPath || getDefaultUserAvatarPath(),
    passwordHash: user.passwordHash,
    tokenVersion: user.tokenVersion
  }
}

function isMongoDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  )
}

export async function createUser(firstName: string, lastName: string, email: string, passwordHash: string): Promise<UserRecord | null> {
  const normalizedEmail = normalizeEmail(email)

  try {
    const user = await UserModel.create({
      firstName,
      lastName,
      email: normalizedEmail,
      passwordHash
    })

    return toUserRecord(user)
  } catch (error) {
    if (isMongoDuplicateKeyError(error)) {
      return null
    }

    throw error
  }
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const normalizedEmail = normalizeEmail(email)
  const user = await UserModel.findOne({ email: normalizedEmail })

  if (!user) {
    return null
  }

  return toUserRecord(user)
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const user = await UserModel.findById(id)

  if (!user) {
    return null
  }

  return toUserRecord(user)
}

export async function incrementUserTokenVersion(id: string): Promise<void> {
  await UserModel.updateOne(
    { _id: id },
    { $inc: { tokenVersion: 1 } }
  )
}

export async function markUserEmailVerified(id: string): Promise<UserRecord | null> {
  const user = await UserModel.findByIdAndUpdate(
    id,
    {
      $set: {
        isEmailVerified: true
      }
    },
    { new: true }
  )

  if (!user) {
    return null
  }

  return toUserRecord(user)
}

export async function updateUserPasswordHash(id: string, passwordHash: string): Promise<void> {
  await UserModel.updateOne(
    { _id: id },
    { $set: { passwordHash } }
  )
}

export async function updateUserProfile(
  id: string,
  input: {
    firstName: string
    lastName: string
    phone?: string
    avatarPath?: string
  }
): Promise<UserRecord | null> {
  const profileUpdates: {
    firstName: string
    lastName: string
    phone?: string
    avatarPath?: string
  } = {
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone?.trim() || undefined
  }

  if (input.avatarPath !== undefined) {
    profileUpdates.avatarPath = input.avatarPath.trim() || getDefaultUserAvatarPath()
  }

  const user = await UserModel.findByIdAndUpdate(
    id,
    {
      $set: profileUpdates
    },
    { new: true }
  )

  if (!user) {
    return null
  }

  return toUserRecord(user)
}
