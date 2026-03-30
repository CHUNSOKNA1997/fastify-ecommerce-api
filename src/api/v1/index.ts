import { FastifyPluginAsync } from 'fastify'
import accountRoutes from './account'
import authRoutes from './auth'
import commerceRoutes from './commerce'

const v1Routes: FastifyPluginAsync = async (fastify): Promise<void> => {
	void fastify.register(authRoutes, { prefix: '/auth' })
	void fastify.register(accountRoutes)
	void fastify.register(commerceRoutes)
}

export default v1Routes
