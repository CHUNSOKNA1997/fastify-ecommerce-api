import { FastifyPluginAsync } from 'fastify'
import axios from 'axios'
import crypto from 'node:crypto'
import { PaymentService } from '../../modules/payway/payment.service'

type CreatePaywayPaymentBody = {
  amount: number
  currency?: string
  paymentOption?: string
  phone?: string
  returnParams?: string
}

type PaywayStatusParams = {
  tranId: string
}

type HostedCheckoutParams = {
  tranId: string
}

type HostedCheckoutQuery = {
  token: string
}

type CheckoutTokenPayload = {
  sub: string
  tranId: string
  exp: number
  type: 'payway_checkout'
}

type PaywayCallbackBody = {
  tran_id: string
  status: string | number
  apv?: string
  return_params?: string
  [key: string]: unknown
}

const paywayRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const paymentService = new PaymentService()
  const isDevelopment = (process.env.NODE_ENV ?? 'development').toLowerCase() !== 'production'

  function formatProviderError(error: unknown) {
    if (axios.isAxiosError(error)) {
      return {
        statusCode: error.response?.status ?? 502,
        error: error.response?.statusText ?? 'Bad Gateway',
        message: error.message,
        providerResponse: error.response?.data
      }
    }

    if (error instanceof Error) {
      return {
        statusCode: 500,
        error: 'Internal Server Error',
        message: error.message
      }
    }

    return {
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Unknown PayWay error'
    }
  }

  function buildHostedCheckoutUrl(tranId: string, token: string) {
    return `/api/v1/payments/payway/checkout/${encodeURIComponent(tranId)}?token=${encodeURIComponent(token)}`
  }

  function getCheckoutTokenSecret() {
    const secret = process.env.PAYWAY_CHECKOUT_TOKEN_SECRET?.trim() || process.env.JWT_SECRET?.trim()
    if (!secret) {
      throw new Error('PAYWAY_CHECKOUT_TOKEN_SECRET or JWT_SECRET is required')
    }

    return secret
  }

  function createCheckoutToken(payload: Omit<CheckoutTokenPayload, 'exp'>, expiresInSeconds = 600) {
    const body: CheckoutTokenPayload = {
      ...payload,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds
    }
    const encodedPayload = Buffer.from(JSON.stringify(body)).toString('base64url')
    const signature = crypto
      .createHmac('sha256', getCheckoutTokenSecret())
      .update(encodedPayload)
      .digest('base64url')

    return `${encodedPayload}.${signature}`
  }

  function verifyCheckoutToken(token: string): CheckoutTokenPayload {
    const [encodedPayload, signature] = token.split('.')
    if (!encodedPayload || !signature) {
      throw new Error('Invalid checkout token')
    }

    const expectedSignature = crypto
      .createHmac('sha256', getCheckoutTokenSecret())
      .update(encodedPayload)
      .digest('base64url')

    if (expectedSignature.length !== signature.length) {
      throw new Error('Invalid checkout token')
    }

    if (
      !crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'utf8'),
        Buffer.from(signature, 'utf8')
      )
    ) {
      throw new Error('Invalid checkout token')
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as CheckoutTokenPayload
    if (
      payload.type !== 'payway_checkout' ||
      payload.sub.trim().length === 0 ||
      payload.tranId.trim().length === 0 ||
      !Number.isInteger(payload.exp) ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      throw new Error('Invalid checkout token')
    }

    return payload
  }

  fastify.post<{ Body: CreatePaywayPaymentBody }>('/create', {
    preHandler: fastify.authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['amount'],
        additionalProperties: false,
        properties: {
          amount: { type: 'number', exclusiveMinimum: 0 },
          currency: { type: 'string', minLength: 3, maxLength: 3 },
          paymentOption: { type: 'string', minLength: 1, maxLength: 50 },
          phone: { type: 'string', minLength: 1, maxLength: 30 },
          returnParams: { type: 'string', minLength: 1, maxLength: 1000 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const acceptsHtml = request.headers.accept?.includes('text/html') ?? false

      const session = await paymentService.createHostedCheckoutSession(request.user.sub, request.body)
      const token = createCheckoutToken(
        {
          sub: request.user.sub,
          tranId: session.payment.tranId,
          type: 'payway_checkout'
        },
        600
      )
      const checkoutUrl = buildHostedCheckoutUrl(session.payment.tranId, token)

      if (acceptsHtml) {
        reply.code(201).type('text/html; charset=utf-8')
        return `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width,initial-scale=1" />
            <title>Redirecting to Checkout</title>
          </head>
          <body>
            <script>
              window.location.replace(${JSON.stringify(checkoutUrl)});
            </script>
            <noscript>
              <meta http-equiv="refresh" content="0;url=${checkoutUrl}" />
              <a href="${checkoutUrl}">Continue to checkout</a>
            </noscript>
          </body>
        </html>`
      }

      reply.code(201)
      return {
        message: 'PayWay payment created',
        payment: session.payment,
        checkoutUrl
      }
    } catch (error) {
      const providerError = formatProviderError(error)

      reply.code(providerError.statusCode)
      return isDevelopment ? providerError : {
        statusCode: providerError.statusCode,
        error: providerError.error,
        message: providerError.message
      }
    }
  })

  fastify.post<{ Body: CreatePaywayPaymentBody }>('/checkout-sessions', {
    preHandler: fastify.authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['amount'],
        additionalProperties: false,
        properties: {
          amount: { type: 'number', exclusiveMinimum: 0 },
          currency: { type: 'string', minLength: 3, maxLength: 3 },
          paymentOption: { type: 'string', minLength: 1, maxLength: 50 },
          phone: { type: 'string', minLength: 1, maxLength: 30 },
          returnParams: { type: 'string', minLength: 1, maxLength: 1000 }
        }
      }
    }
  }, async (request, reply) => {
    const session = await paymentService.createHostedCheckoutSession(request.user.sub, request.body)
    const token = createCheckoutToken(
      {
        sub: request.user.sub,
        tranId: session.payment.tranId,
        type: 'payway_checkout'
      },
      600
    )
    const checkoutUrl = buildHostedCheckoutUrl(session.payment.tranId, token)

    reply.code(201)
    return {
      message: 'Hosted checkout session created',
      payment: session.payment,
      checkoutUrl,
      expiresIn: '10m'
    }
  })

  fastify.get<{ Params: HostedCheckoutParams, Querystring: HostedCheckoutQuery }>('/checkout/:tranId', {
    schema: {
      params: {
        type: 'object',
        required: ['tranId'],
        additionalProperties: false,
        properties: {
          tranId: { type: 'string', minLength: 1, maxLength: 50 }
        }
      },
      querystring: {
        type: 'object',
        required: ['token'],
        additionalProperties: false,
        properties: {
          token: { type: 'string', minLength: 1, maxLength: 4000 }
        }
      }
    }
  }, async (request, reply) => {
    let payload: CheckoutTokenPayload

    try {
      payload = verifyCheckoutToken(request.query.token)
    } catch {
      throw fastify.httpErrors.unauthorized('Invalid checkout token')
    }

    if (
      payload.type !== 'payway_checkout' ||
      payload.sub.trim().length === 0 ||
      payload.tranId !== request.params.tranId
    ) {
      throw fastify.httpErrors.unauthorized('Invalid checkout token')
    }

    try {
      const result = await paymentService.getHostedCheckoutForUser(payload.sub, request.params.tranId)

      reply.type('text/html; charset=utf-8')
      return result.checkoutHtml
    } catch (error) {
      if (error instanceof Error && error.message === 'Payment not found') {
        throw fastify.httpErrors.notFound('Payment not found')
      }

      throw error
    }
  })

  fastify.get<{ Params: PaywayStatusParams }>('/:tranId', {
    preHandler: fastify.authenticate,
    schema: {
      params: {
        type: 'object',
        required: ['tranId'],
        additionalProperties: false,
        properties: {
          tranId: { type: 'string', minLength: 1, maxLength: 50 }
        }
      }
    }
  }, async (request) => {
    try {
      return await paymentService.getPaymentStatusForUser(request.user.sub, request.params.tranId)
    } catch (error) {
      if (error instanceof Error && error.message === 'Payment not found') {
        throw fastify.httpErrors.notFound('Payment not found')
      }

      throw error
    }
  })

  fastify.post<{ Body: PaywayCallbackBody }>('/callback', {
    schema: {
      body: {
        type: 'object',
        required: ['tran_id', 'status'],
        additionalProperties: true,
        properties: {
          tran_id: { type: 'string', minLength: 1, maxLength: 100 },
          status: {
            anyOf: [
              { type: 'string', minLength: 1, maxLength: 20 },
              { type: 'number' }
            ]
          },
          apv: { type: 'string', minLength: 1, maxLength: 50 },
          return_params: { type: 'string', minLength: 1, maxLength: 1000 }
        }
      }
    }
  }, async (request) => {
    const signatureHeader = request.headers['x-payway-hmac-sha512']
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader

    if (!signature || !paymentService.verifyCallbackSignature(request.body, signature)) {
      throw fastify.httpErrors.unauthorized('Invalid PayWay signature')
    }

    await paymentService.handleCallback(request.body)

    return {
      message: 'PayWay callback processed'
    }
  })
}

export default paywayRoutes
