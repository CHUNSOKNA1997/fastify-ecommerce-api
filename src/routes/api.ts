import { FastifyPluginAsync } from 'fastify'
import v1Routes from '../api/v1'
import paymentRoutes from '../modules/payway/payment.routes'

export const autoPrefix = '/api'

const apiRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  void fastify.register(v1Routes, { prefix: '/v1' })
  void fastify.register(paymentRoutes, { prefix: '/payments' })
}

export default apiRoutes
