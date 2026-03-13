import { FastifyPluginAsync } from 'fastify'
import authRoutes from './auth'

const v1Routes: FastifyPluginAsync = async (fastify): Promise<void> => {
  void fastify.register(authRoutes, { prefix: '/auth' })
}

export default v1Routes
