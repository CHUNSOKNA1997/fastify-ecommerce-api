import fp from 'fastify-plugin'

const FORM_CONTENT_TYPE = /^application\/x-www-form-urlencoded(?:\s*;.*)?$/i

export default fp(async (fastify) => {
  fastify.addContentTypeParser(
    FORM_CONTENT_TYPE,
    { parseAs: 'string' },
    (_request, body, done) => {
      try {
        const rawBody = typeof body === 'string' ? body : body.toString('utf8')
        const parsed = Object.fromEntries(new URLSearchParams(rawBody))
        done(null, parsed)
      } catch (error) {
        done(error as Error)
      }
    }
  )
})
