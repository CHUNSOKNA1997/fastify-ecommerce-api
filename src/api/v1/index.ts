import { FastifyPluginAsync } from 'fastify'
import authRoutes from './auth'
import paywayRoutes from './payway'

const v1Routes: FastifyPluginAsync = async (fastify): Promise<void> => {
	void fastify.register(authRoutes, { prefix: '/auth' })
	void fastify.register(paywayRoutes, { prefix: '/payments/payway' })
}

export default v1Routes
