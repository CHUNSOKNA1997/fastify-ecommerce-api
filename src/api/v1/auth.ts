import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import {
	markUserEmailVerified,
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
import {
	findLatestActiveEmailVerificationOtp,
	hasEmailVerificationOtpExceededAttempts,
	incrementEmailVerificationOtpAttemptCount,
	isEmailVerificationOtpCodeValid,
	issueEmailVerificationOtp,
	markEmailVerificationOtpUsed,
	revokeAllEmailVerificationOtpsForUser
} from '../../modules/auth/email-verification-otp.repository'
import { sendEmailVerificationOtp, sendPasswordResetToken } from '../../modules/auth/mail.service'

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

type VerifyEmailBody = {
	email: string
	otp: string
}

type ResendEmailOtpBody = {
	email: string
}

type VerifyForgotPasswordOtpBody = {
	email: string
	otp: string
}

type ResetPasswordBody = {
	resetToken: string
	password: string
	confirmPassword: string
}

const authRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
	const userSchema = {
		type: 'object',
		properties: {
			id: { type: 'string' },
			firstName: { type: 'string' },
			lastName: { type: 'string' },
			email: { type: 'string', format: 'email' },
			avatarPath: { type: 'string' },
			isEmailVerified: { type: 'boolean' }
		}
	} as const

	const authSuccessSchema = {
		type: 'object',
		properties: {
			user: userSchema,
			accessToken: { type: 'string' },
			refreshToken: { type: 'string' }
		}
	} as const

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

	function getEmailVerificationOtpTtlMinutes(): number {
		const rawValue = process.env.EMAIL_VERIFICATION_OTP_TTL_MINUTES?.trim() || '10'
		const ttlMinutes = Number.parseInt(rawValue, 10)

		if (!Number.isInteger(ttlMinutes) || ttlMinutes <= 0) {
			throw new Error('EMAIL_VERIFICATION_OTP_TTL_MINUTES must be a positive integer')
		}

		return ttlMinutes
	}

	function buildPasswordResetSessionToken(user: { id: string, email: string, tokenVersion: number }): string {
		return fastify.jwt.sign(
			{
				sub: user.id,
				email: user.email,
				tokenVersion: user.tokenVersion,
				purpose: 'password-reset'
			} as any,
			{ expiresIn: `${getResetTokenTtlMinutes()}m` }
		)
	}

	async function buildAuthResponse(user: { id: string, firstName: string, lastName: string, email: string, avatarPath: string, isEmailVerified: boolean, tokenVersion: number }) {
		const accessToken = fastify.jwt.sign(
			{ sub: user.id, email: user.email, tokenVersion: user.tokenVersion }
		)
		const issuedRefreshToken = await issueRefreshToken(user.id, user.tokenVersion, getRefreshTokenTtlDays())

		return {
			user: {
				id: user.id,
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email,
				avatarPath: user.avatarPath,
				isEmailVerified: user.isEmailVerified
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
			tags: ['Auth'],
			summary: 'Register user',
			description: 'Create a new user account and send an email verification OTP.',
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
			},
			response: {
				201: {
					type: 'object',
					properties: {
						message: { type: 'string' },
						user: userSchema,
						verificationOtp: { type: 'string' },
						expiresInMinutes: { type: 'integer' }
					}
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

		const otpTtlMinutes = getEmailVerificationOtpTtlMinutes()
		await revokeAllEmailVerificationOtpsForUser(user.id)
		const issuedOtp = await issueEmailVerificationOtp(user.id, user.email, otpTtlMinutes)
		await sendEmailVerificationOtp(user.email, issuedOtp.code, otpTtlMinutes)
		const isProduction = (process.env.NODE_ENV ?? 'development').toLowerCase() === 'production'

		reply.code(201)
		return {
			message: 'Registration successful. Please verify your email with the OTP we sent.',
			user: {
				id: user.id,
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email,
				avatarPath: user.avatarPath,
				isEmailVerified: user.isEmailVerified
			},
			...(isProduction ? {} : { verificationOtp: issuedOtp.code }),
			expiresInMinutes: otpTtlMinutes
		}
	})

	fastify.post<{ Body: VerifyEmailBody }>('/verify-email', {
		schema: {
			tags: ['Auth'],
			summary: 'Verify email',
			description: 'Verify a newly registered email address using the OTP code.',
			body: {
				type: 'object',
				required: ['email', 'otp'],
				additionalProperties: false,
				properties: {
					email: { type: 'string', format: 'email', maxLength: 254 },
					otp: { type: 'string', minLength: 6, maxLength: 6 }
				}
			},
			response: {
				200: {
					type: 'object',
					properties: {
						message: { type: 'string' },
						...authSuccessSchema.properties
					}
				}
			}
		}
	}, async (request) => {
		const email = request.body.email.trim()
		const otp = request.body.otp.trim()
		const user = await findUserByEmail(email)

		if (!user) {
			throw fastify.httpErrors.notFound('User not found')
		}

		if (user.isEmailVerified) {
			throw fastify.httpErrors.badRequest('Email is already verified')
		}

		const otpRecord = await findLatestActiveEmailVerificationOtp(email)
		if (!otpRecord) {
			throw fastify.httpErrors.unauthorized('Verification code is invalid or expired')
		}

		if (otpRecord.usedAt || otpRecord.expiresAt.getTime() <= Date.now()) {
			await markEmailVerificationOtpUsed(otpRecord.id)
			throw fastify.httpErrors.unauthorized('Verification code is invalid or expired')
		}

		if (hasEmailVerificationOtpExceededAttempts(otpRecord)) {
			await markEmailVerificationOtpUsed(otpRecord.id)
			throw fastify.httpErrors.tooManyRequests('Verification code has been locked. Please request a new one.')
		}

		if (!isEmailVerificationOtpCodeValid(otp, otpRecord)) {
			await incrementEmailVerificationOtpAttemptCount(otpRecord.id)
			throw fastify.httpErrors.unauthorized('Verification code is invalid or expired')
		}

		await markEmailVerificationOtpUsed(otpRecord.id)
		const verifiedUser = await markUserEmailVerified(user.id)
		if (!verifiedUser) {
			throw fastify.httpErrors.notFound('User not found')
		}

		const response = await buildAuthResponse(verifiedUser)
		return {
			message: 'Email verified successfully',
			user: response.user,
			accessToken: response.accessToken,
			refreshToken: response.refreshToken
		}
	})

	fastify.post<{ Body: ResendEmailOtpBody }>('/resend-email-otp', {
		schema: {
			tags: ['Auth'],
			summary: 'Resend email OTP',
			description: 'Send a fresh email verification OTP to an unverified account.',
			body: {
				type: 'object',
				required: ['email'],
				additionalProperties: false,
				properties: {
					email: { type: 'string', format: 'email', maxLength: 254 }
				}
			},
			response: {
				200: {
					type: 'object',
					properties: {
						message: { type: 'string' },
						verificationOtp: { type: 'string' },
						expiresInMinutes: { type: 'integer' }
					}
				}
			}
		}
	}, async (request) => {
		const email = request.body.email.trim()
		const user = await findUserByEmail(email)

		if (!user) {
			return {
				message: 'If the account exists, a verification code has been sent'
			}
		}

		if (user.isEmailVerified) {
			return {
				message: 'Email is already verified'
			}
		}

		const otpTtlMinutes = getEmailVerificationOtpTtlMinutes()
		await revokeAllEmailVerificationOtpsForUser(user.id)
		const issuedOtp = await issueEmailVerificationOtp(user.id, user.email, otpTtlMinutes)
		await sendEmailVerificationOtp(user.email, issuedOtp.code, otpTtlMinutes)
		const isProduction = (process.env.NODE_ENV ?? 'development').toLowerCase() === 'production'

		return {
			message: 'Verification code sent',
			...(isProduction ? {} : { verificationOtp: issuedOtp.code }),
			expiresInMinutes: otpTtlMinutes
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
			tags: ['Auth'],
			summary: 'Login user',
			description: 'Authenticate a user with email and password.',
			body: {
				type: 'object',
				required: ['email', 'password'],
				additionalProperties: false,
				properties: {
					email: { type: 'string', format: 'email', maxLength: 254 },
					password: { type: 'string', minLength: 8, maxLength: 72 }
				}
			},
			response: {
				200: authSuccessSchema
			}
		}
	}, async (request) => {
		const { email, password } = request.body
		const user = await findUserByEmail(email.trim())

		if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
			throw fastify.httpErrors.unauthorized('Invalid email or password')
		}

		if (!user.isEmailVerified) {
			throw fastify.httpErrors.forbidden('Please verify your email first')
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
			tags: ['Auth'],
			summary: 'Refresh access token',
			description: 'Exchange a valid refresh token for a new access token and refresh token.',
			body: {
				type: 'object',
				required: ['refreshToken'],
				additionalProperties: false,
				properties: {
					refreshToken: { type: 'string', minLength: 16, maxLength: 500 }
				}
			},
			response: {
				200: authSuccessSchema
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

		if (!user.isEmailVerified) {
			await revokeAllUserRefreshTokens(existingToken.userId)
			throw fastify.httpErrors.forbidden('Please verify your email first')
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
			tags: ['Auth'],
			summary: 'Forgot password',
			description: 'Request a password reset OTP. In non-production environments the OTP is returned in the response.',
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
		await sendPasswordResetToken(user.email, issuedToken.token, getResetTokenTtlMinutes())
		const isProduction = (process.env.NODE_ENV ?? 'development').toLowerCase() === 'production'

		if (isProduction) {
			return {
				message: 'If the account exists, password reset instructions have been sent'
			}
		}

		return {
			message: 'Password reset OTP generated',
			resetOtp: issuedToken.token
		}
	})

	fastify.post<{ Body: VerifyForgotPasswordOtpBody }>('/forgot-password/otp-verify', {
		schema: {
			tags: ['Auth'],
			summary: 'Verify forgot password OTP',
			description: 'Verify the password reset OTP and return a short-lived reset token.',
			body: {
				type: 'object',
				required: ['email', 'otp'],
				additionalProperties: false,
				properties: {
					email: { type: 'string', format: 'email', maxLength: 254 },
					otp: { type: 'string', minLength: 6, maxLength: 6 }
				}
			},
			response: {
				200: {
					type: 'object',
					properties: {
						message: { type: 'string' },
						resetToken: { type: 'string' }
					}
				}
			}
		}
	}, async (request) => {
		const email = request.body.email.trim()
		const otp = request.body.otp.trim()
		const user = await findUserByEmail(email)

		if (!user) {
			throw fastify.httpErrors.unauthorized('Invalid password reset OTP')
		}

		const resetRecord = await findPasswordResetToken(otp)
		if (!resetRecord) {
			throw fastify.httpErrors.unauthorized('Invalid password reset OTP')
		}

		if (resetRecord.userId !== user.id) {
			throw fastify.httpErrors.unauthorized('Invalid password reset OTP')
		}

		if (resetRecord.usedAt) {
			throw fastify.httpErrors.unauthorized('Password reset OTP has already been used')
		}

		if (resetRecord.expiresAt.getTime() <= Date.now()) {
			await markPasswordResetTokenUsed(resetRecord.id)
			throw fastify.httpErrors.unauthorized('Password reset OTP has expired')
		}

		await markPasswordResetTokenUsed(resetRecord.id)

		return {
			message: 'OTP verified successfully',
			resetToken: buildPasswordResetSessionToken(user)
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
			tags: ['Auth'],
			summary: 'Reset password',
			description: 'Reset a user password using a valid short-lived reset token.',
			body: {
				type: 'object',
				required: ['resetToken', 'password', 'confirmPassword'],
				additionalProperties: false,
				properties: {
					resetToken: { type: 'string', minLength: 16, maxLength: 2000 },
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

		let decoded: { sub: string, email: string, tokenVersion: number, purpose?: string }
		try {
			decoded = await fastify.jwt.verify(resetToken.trim()) as { sub: string, email: string, tokenVersion: number, purpose?: string }
		} catch {
			throw fastify.httpErrors.unauthorized('Invalid password reset token')
		}

		if (decoded.purpose !== 'password-reset') {
			throw fastify.httpErrors.unauthorized('Invalid password reset token')
		}

		const user = await findUserById(decoded.sub)
		if (!user || user.email !== decoded.email || user.tokenVersion !== decoded.tokenVersion) {
			throw fastify.httpErrors.unauthorized('Invalid password reset token')
		}

		const passwordHash = await bcrypt.hash(password, 10)
		await updateUserPasswordHash(user.id, passwordHash)
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
		preHandler: fastify.authenticate,
		schema: {
			tags: ['Auth'],
			summary: 'Get current user',
			description: 'Return the authenticated user profile.',
			security: [{ bearerAuth: [] }],
			response: {
				200: {
					type: 'object',
					properties: {
						user: {
							type: 'object',
							properties: {
								...userSchema.properties,
								phone: { anyOf: [{ type: 'string' }, { type: 'null' }] }
							}
						}
					}
				}
			}
		}
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
				phone: user.phone ?? null,
				avatarPath: user.avatarPath,
				isEmailVerified: user.isEmailVerified
			}
		}
	})

}

export default authRoutes
