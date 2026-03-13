import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'
import { FastifyReply, FastifyRequest } from 'fastify'

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
  })
})

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string
      email: string
    }
    user: {
      sub: string
      email: string
    }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>
  }
}
