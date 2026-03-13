import { FastifyPluginAsync } from 'fastify'
import v1Routes from '../api/v1'

export const autoPrefix = '/api'

const apiRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  void fastify.register(v1Routes, { prefix: '/v1' })
}

export default apiRoutes
