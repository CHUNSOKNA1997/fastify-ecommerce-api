import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'
import { FastifyReply, FastifyRequest } from 'fastify'
import { findUserById } from '../modules/auth/user.repository'

const WEAK_DEFAULT_SECRETS = new Set([
  'change-me-in-production',
  'changeme',
  'secret',
  'password',
  'jwt-secret'
])

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (typeof secret !== 'string' || secret.trim().length === 0) {
    throw new Error('JWT_SECRET is required')
  }

  const normalizedSecret = secret.trim()
  const nodeEnv = (process.env.NODE_ENV ?? 'development').toLowerCase()
  const isDevOrTest = nodeEnv === 'development' || nodeEnv === 'test'

  if (WEAK_DEFAULT_SECRETS.has(normalizedSecret.toLowerCase())) {
    throw new Error('JWT_SECRET is using a known insecure default value')
  }

  if (normalizedSecret.length < 16) {
    throw new Error('JWT_SECRET must be at least 16 characters long')
  }

  if (!isDevOrTest && normalizedSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long outside development/test')
  }

  return normalizedSecret
}

export default fp(async (fastify) => {
  fastify.register(fastifyJwt, {
    secret: getJwtSecret()
  })

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    await request.jwtVerify()

    const tokenUser = request.user
    const dbUser = await findUserById(tokenUser.sub)

    if (!dbUser || dbUser.tokenVersion !== tokenUser.tokenVersion) {
      await reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Token is no longer valid'
      })
    }
  })
})

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string
      email: string
      tokenVersion: number
    }
    user: {
      sub: string
      email: string
      tokenVersion: number
    }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void | FastifyReply>
  }
}
