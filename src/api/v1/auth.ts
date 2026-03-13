import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { createUser, findUserByEmail, findUserById, incrementUserTokenVersion } from '../../modules/auth/user.repository'

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

const authRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
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

		const accessToken = fastify.jwt.sign(
			{ sub: user.id, email: user.email, tokenVersion: user.tokenVersion },
			{ expiresIn: '1h' }
		)

		reply.code(201)
		return {
			user: {
				id: user.id,
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email
			},
			accessToken
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

		const accessToken = fastify.jwt.sign(
			{ sub: user.id, email: user.email, tokenVersion: user.tokenVersion },
			{ expiresIn: '1h' }
		)

		return {
			user: {
				id: user.id,
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email
			},
			accessToken
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
		await incrementUserTokenVersion(request.user.sub)

		return {
			message: 'Logged out successfully'
		}
	})
}

export default authRoutes
