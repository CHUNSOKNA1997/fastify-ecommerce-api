import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import {
	createUser,
	findUserByEmail,
	findUserById,
	incrementUserTokenVersion,
	updateUserPasswordHash
} from '../../modules/auth/user.repository'
import {
	issueRefreshToken,
	findRefreshToken,
	revokeAllUserRefreshTokens,
	revokeRefreshTokenById
} from '../../modules/auth/refresh-token.repository'
import {
	findPasswordResetToken,
	issuePasswordResetToken,
	markPasswordResetTokenUsed,
	revokeAllPasswordResetTokens
} from '../../modules/auth/password-reset-token.repository'

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

type ForgotPasswordBody = {
	email: string
}

type ResetPasswordBody = {
	resetToken: string
	password: string
	confirmPassword: string
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

	function getResetTokenTtlMinutes(): number {
		const rawValue = process.env.RESET_PASSWORD_TOKEN_TTL_MINUTES?.trim() || '15'
		const ttlMinutes = Number.parseInt(rawValue, 10)

		if (!Number.isInteger(ttlMinutes) || ttlMinutes <= 0) {
			throw new Error('RESET_PASSWORD_TOKEN_TTL_MINUTES must be a positive integer')
		}

		return ttlMinutes
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
	 * @route POST /register
	 * @description Register a new user
	 * @response 201 - User registered
	 * @response 400 - Bad request
	 * @response 409 - Conflict
	 * @response 500 - Internal server error
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
	 * @route POST /login
	 * @description Login user
	 * @response 200 - User logged in
	 * @response 400 - Bad request
	 * @response 401 - Unauthorized
	 * @response 500 - Internal server error
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

	/**
	 * Refresh access token
	 * @route POST /refresh
	 * @description Refresh access token
	 * @response 200 - Access token refreshed
	 * @response 400 - Bad request
	 * @response 401 - Unauthorized
	 * @response 500 - Internal server error
	 */
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
	 * Forgot password
	 * @route POST /forgot-password
	 * @description Forgot password
	 * @response 200 - Password reset instructions sent
	 * @response 400 - Bad request
	 * @response 500 - Internal server error
	 */
	fastify.post<{ Body: ForgotPasswordBody }>('/forgot-password', {
		schema: {
			body: {
				type: 'object',
				required: ['email'],
				additionalProperties: false,
				properties: {
					email: { type: 'string', format: 'email', maxLength: 254 }
				}
			}
		}
	}, async (request) => {
		const user = await findUserByEmail(request.body.email.trim())

		if (!user) {
			return {
				message: 'If the account exists, password reset instructions have been sent'
			}
		}

		await revokeAllPasswordResetTokens(user.id)
		const issuedToken = await issuePasswordResetToken(user.id, getResetTokenTtlMinutes())
		const isProduction = (process.env.NODE_ENV ?? 'development').toLowerCase() === 'production'

		if (isProduction) {
			return {
				message: 'If the account exists, password reset instructions have been sent'
			}
		}

		return {
			message: 'Password reset token generated',
			resetToken: issuedToken.token
		}
	})

	/**
	 * Reset password
	 * @route POST /reset-password
	 * @description Reset password
	 * @response 200 - Password reset successfully
	 * @response 400 - Bad request
	 * @response 401 - Unauthorized
	 * @response 500 - Internal server error
	 */
	fastify.post<{ Body: ResetPasswordBody }>('/reset-password', {
		schema: {
			body: {
				type: 'object',
				required: ['resetToken', 'password', 'confirmPassword'],
				additionalProperties: false,
				properties: {
					resetToken: { type: 'string', minLength: 16, maxLength: 500 },
					password: { type: 'string', minLength: 8, maxLength: 72 },
					confirmPassword: { type: 'string', minLength: 8, maxLength: 72 }
				}
			}
		}
	}, async (request) => {
		const { resetToken, password, confirmPassword } = request.body
		if (password !== confirmPassword) {
			throw fastify.httpErrors.badRequest('Password and confirm password do not match')
		}

		const resetRecord = await findPasswordResetToken(resetToken.trim())
		if (!resetRecord) {
			throw fastify.httpErrors.unauthorized('Invalid password reset token')
		}

		if (resetRecord.usedAt) {
			throw fastify.httpErrors.unauthorized('Password reset token has already been used')
		}

		if (resetRecord.expiresAt.getTime() <= Date.now()) {
			await markPasswordResetTokenUsed(resetRecord.id)
			throw fastify.httpErrors.unauthorized('Password reset token has expired')
		}

		const user = await findUserById(resetRecord.userId)
		if (!user) {
			throw fastify.httpErrors.unauthorized('User no longer exists')
		}

		const passwordHash = await bcrypt.hash(password, 10)
		await updateUserPasswordHash(user.id, passwordHash)
		await markPasswordResetTokenUsed(resetRecord.id)
		await revokeAllPasswordResetTokens(user.id)
		await revokeAllUserRefreshTokens(user.id)
		await incrementUserTokenVersion(user.id)

		return {
			message: 'Password has been reset successfully'
		}
	})

	/**
	 * Get current user
	 * @route GET /me
	 * @description Get current user
	 * @response 200 - Current user
	 * @response 400 - Bad request
	 * @response 401 - Unauthorized
	 * @response 500 - Internal server error
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
				email: user.email,
				phone: user.phone ?? null
			}
		}
	})

	/**
	 * Logout user
	 * @route POST /logout
	 * @description Logout user
	 * @response 200 - User logged out
	 * @response 400 - Bad request
	 * @response 401 - Unauthorized
	 * @response 500 - Internal server error
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
