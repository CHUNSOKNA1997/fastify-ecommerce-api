import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { createUser, findUserByEmail, findUserById, incrementUserTokenVersion } from '../../modules/auth/user.repository'
import {
	issueRefreshToken,
	findRefreshToken,
	revokeAllUserRefreshTokens,
	revokeRefreshTokenById
} from '../../modules/auth/refresh-token.repository'

type RegisterBody = {
	firstName: string
	lastName: string
	email: string
	password: string
	confirmPassword: string
}

type LoginBody = {
	email: string
	password: string
}

type RefreshBody = {
	refreshToken: string
}

const authRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
	function getAccessTokenTtl(): string {
		return process.env.ACCESS_TOKEN_TTL?.trim() || '1h'
	}

	function getRefreshTokenTtlDays(): number {
		const rawValue = process.env.REFRESH_TOKEN_TTL_DAYS?.trim() || '30'
		const ttlDays = Number.parseInt(rawValue, 10)

		if (!Number.isInteger(ttlDays) || ttlDays <= 0) {
			throw new Error('REFRESH_TOKEN_TTL_DAYS must be a positive integer')
		}

		return ttlDays
	}

	async function buildAuthResponse(user: { id: string, firstName: string, lastName: string, email: string, tokenVersion: number }) {
		const accessToken = fastify.jwt.sign(
			{ sub: user.id, email: user.email, tokenVersion: user.tokenVersion },
			{ expiresIn: getAccessTokenTtl() }
		)
		const issuedRefreshToken = await issueRefreshToken(user.id, user.tokenVersion, getRefreshTokenTtlDays())

		return {
			user: {
				id: user.id,
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email
			},
			accessToken,
			refreshToken: issuedRefreshToken.token,
			refreshTokenId: issuedRefreshToken.record.id
		}
	}

	/**
	 * Register a new user
	 */
	fastify.post<{ Body: RegisterBody }>('/register', {
		schema: {
			body: {
				type: 'object',
				required: ['firstName', 'lastName', 'email', 'password', 'confirmPassword'],
				additionalProperties: false,
				properties: {
					firstName: { type: 'string', minLength: 1, maxLength: 100 },
					lastName: { type: 'string', minLength: 1, maxLength: 100 },
					email: { type: 'string', format: 'email', maxLength: 254 },
					password: { type: 'string', minLength: 8, maxLength: 72 },
					confirmPassword: { type: 'string', minLength: 8, maxLength: 72 }
				}
			}
		}
	}, async (request, reply) => {
		const { firstName, lastName, email, password, confirmPassword } = request.body
		const normalizedFirstName = firstName.trim()
		const normalizedLastName = lastName.trim()
		const normalizedEmail = email.trim()

		if (!normalizedFirstName || !normalizedLastName) {
			throw fastify.httpErrors.badRequest('First name and last name are required')
		}

		if (password !== confirmPassword) {
			throw fastify.httpErrors.badRequest('Password and confirm password do not match')
		}

		const passwordHash = await bcrypt.hash(password, 10)
		const user = await createUser(normalizedFirstName, normalizedLastName, normalizedEmail, passwordHash)

		if (!user) {
			throw fastify.httpErrors.conflict('Email is already registered')
		}

		reply.code(201)
		const response = await buildAuthResponse(user)
		return {
			user: response.user,
			accessToken: response.accessToken,
			refreshToken: response.refreshToken
		}
	})

	/**
	 * Login user
	 */
	fastify.post<{ Body: LoginBody }>('/login', {
		schema: {
			body: {
				type: 'object',
				required: ['email', 'password'],
				additionalProperties: false,
				properties: {
					email: { type: 'string', format: 'email', maxLength: 254 },
					password: { type: 'string', minLength: 8, maxLength: 72 }
				}
			}
		}
	}, async (request) => {
		const { email, password } = request.body
		const user = await findUserByEmail(email.trim())

		if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
			throw fastify.httpErrors.unauthorized('Invalid email or password')
		}

		const response = await buildAuthResponse(user)
		return {
			user: response.user,
			accessToken: response.accessToken,
			refreshToken: response.refreshToken
		}
	})

	fastify.post<{ Body: RefreshBody }>('/refresh', {
		schema: {
			body: {
				type: 'object',
				required: ['refreshToken'],
				additionalProperties: false,
				properties: {
					refreshToken: { type: 'string', minLength: 16, maxLength: 500 }
				}
			}
		}
	}, async (request) => {
		const refreshToken = request.body.refreshToken.trim()
		const existingToken = await findRefreshToken(refreshToken)

		if (!existingToken) {
			throw fastify.httpErrors.unauthorized('Invalid refresh token')
		}

		const isExpired = existingToken.expiresAt.getTime() <= Date.now()
		const isRevoked = existingToken.revokedAt !== null
		const user = await findUserById(existingToken.userId)

		if (!user) {
			throw fastify.httpErrors.unauthorized('User no longer exists')
		}

		if (isRevoked) {
			await revokeAllUserRefreshTokens(existingToken.userId)
			await incrementUserTokenVersion(existingToken.userId)
			throw fastify.httpErrors.unauthorized('Refresh token is no longer valid')
		}

		if (isExpired) {
			await revokeRefreshTokenById(existingToken.id)
			throw fastify.httpErrors.unauthorized('Refresh token is expired')
		}

		if (existingToken.tokenVersion !== user.tokenVersion) {
			await revokeAllUserRefreshTokens(existingToken.userId)
			throw fastify.httpErrors.unauthorized('Refresh token is no longer valid')
		}

		const response = await buildAuthResponse(user)
		await revokeRefreshTokenById(existingToken.id, response.refreshTokenId)

		return {
			user: response.user,
			accessToken: response.accessToken,
			refreshToken: response.refreshToken
		}
	})

	/**
	 * Get current user
	 */
	fastify.get('/me', {
		preHandler: fastify.authenticate
	}, async (request) => {
		const user = await findUserById(request.user.sub)
		if (!user) {
			throw fastify.httpErrors.unauthorized('User no longer exists')
		}

		return {
			user: {
				id: user.id,
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email
			}
		}
	})

	/**
	 * Logout user
	 */
	fastify.post('/logout', {
		preHandler: fastify.authenticate
	}, async (request) => {
		await revokeAllUserRefreshTokens(request.user.sub)
		await incrementUserTokenVersion(request.user.sub)

		return {
			message: 'Logged out successfully'
		}
	})
}

export default authRoutes
