import { join } from 'node:path'
import fp from 'fastify-plugin'
import fastifyStatic from '@fastify/static'

export default fp(async (fastify) => {
  await fastify.register(fastifyStatic, {
    root: join(process.cwd(), 'public'),
    prefix: '/'
  })
})
