import fp from 'fastify-plugin'
import mongoose from 'mongoose'

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI
  if (typeof uri !== 'string' || uri.trim().length === 0) {
    throw new Error('MONGODB_URI is required')
  }

  return uri
}

export default fp(async (fastify) => {
  await mongoose.connect(getMongoUri())

  fastify.addHook('onClose', async () => {
    await mongoose.disconnect()
  })
})
