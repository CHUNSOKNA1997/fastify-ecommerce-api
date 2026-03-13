import { HydratedDocument } from 'mongoose'
import { User, UserModel } from './user.model'

export interface UserRecord {
  id: string
  firstName: string
  lastName: string
  email: string
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
    passwordHash: user.passwordHash,
    tokenVersion: user.tokenVersion
  }
}

export async function createUser(firstName: string, lastName: string, email: string, passwordHash: string): Promise<UserRecord | null> {
  const normalizedEmail = normalizeEmail(email)
  const existingUser = await UserModel.findOne({ email: normalizedEmail })

  if (existingUser) {
    return null
  }

  const user = await UserModel.create({
    firstName,
    lastName,
    email: normalizedEmail,
    passwordHash
  })

  return toUserRecord(user)
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
