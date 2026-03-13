import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { createUser, findUserByEmail } from '../modules/auth/user.repository'

type AuthBody = {
  email: string
  password: string
}

const auth: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.post<{ Body: AuthBody }>('/api/v1/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        additionalProperties: false,
        properties: {
          email: { type: 'string', minLength: 3 },
          password: { type: 'string', minLength: 8 }
        }
      }
    }
  }, async (request, reply) => {
    const { email, password } = request.body
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await createUser(email, passwordHash)

    if (!user) {
      throw fastify.httpErrors.conflict('Email is already registered')
    }

    const accessToken = fastify.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: '1h' })

    reply.code(201)
    return {
      user: {
        id: user.id,
        email: user.email
      },
      accessToken
    }
  })

  fastify.post<{ Body: AuthBody }>('/api/v1/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        additionalProperties: false,
        properties: {
          email: { type: 'string', minLength: 3 },
          password: { type: 'string', minLength: 8 }
        }
      }
    }
  }, async (request) => {
    const { email, password } = request.body
    const user = await findUserByEmail(email)

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw fastify.httpErrors.unauthorized('Invalid email or password')
    }

    const accessToken = fastify.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: '1h' })

    return {
      user: {
        id: user.id,
        email: user.email
      },
      accessToken
    }
  })

  fastify.get('/api/v1/auth/me', {
    preHandler: fastify.authenticate
  }, async (request) => {
    return {
      user: {
        id: request.user.sub,
        email: request.user.email
      }
    }
  })

  fastify.post('/api/v1/auth/logout', {
    preHandler: fastify.authenticate
  }, async () => {
    return {
      message: 'Logged out successfully'
    }
  })
}

export default auth
