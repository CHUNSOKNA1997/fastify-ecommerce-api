import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'
import { FastifyReply, FastifyRequest } from 'fastify'
import { findUserById } from '../modules/auth/user.repository'

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (typeof secret !== 'string' || secret.trim().length === 0) {
    throw new Error('JWT_SECRET is required')
  }
  return secret
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
