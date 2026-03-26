import { FastifyPluginAsync } from 'fastify'
import accountRoutes from './account'
import authRoutes from './auth'
import commerceRoutes from './commerce'
import paywayRoutes from './payway'

const v1Routes: FastifyPluginAsync = async (fastify): Promise<void> => {
	void fastify.register(authRoutes, { prefix: '/auth' })
	void fastify.register(accountRoutes)
	void fastify.register(commerceRoutes)
	void fastify.register(paywayRoutes, { prefix: '/payments/payway' })
}

export default v1Routes
