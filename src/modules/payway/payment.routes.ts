import { FastifyPluginAsync } from 'fastify'
import { PaymentController } from './payment.controller'

const paymentRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const controller = new PaymentController()

  fastify.post('/create-checkout', {
    schema: {
      tags: ['PayWay'],
      summary: 'Create PayWay checkout',
      description: 'Create a PayWay checkout session and return the hosted checkout URL and signed purchase payload.',
      body: {
        type: 'object',
        required: ['amount', 'orderId'],
        additionalProperties: false,
        properties: {
          amount: {
            type: 'number',
            exclusiveMinimum: 0
          },
          orderId: {
            type: 'string',
            minLength: 1,
            maxLength: 100
          }
        }
      }
    }
  }, controller.createCheckout.bind(controller))

  fastify.get('/checkout/:paymentId', {
    schema: {
      tags: ['PayWay'],
      summary: 'Open PayWay checkout',
      description: 'Open the browser-facing PayWay checkout URL for a payment.',
      params: {
        type: 'object',
        required: ['paymentId'],
        additionalProperties: false,
        properties: {
          paymentId: {
            type: 'string',
            minLength: 1,
            maxLength: 100
          }
        }
      }
    }
  }, controller.getCheckoutPage.bind(controller))

  fastify.get('/status/:paymentId', {
    schema: {
      tags: ['PayWay'],
      summary: 'Get payment status',
      description: 'Return the current payment status and checkout expiry time.',
      params: {
        type: 'object',
        required: ['paymentId'],
        additionalProperties: false,
        properties: {
          paymentId: {
            type: 'string',
            minLength: 1,
            maxLength: 100
          }
        }
      }
    }
  }, controller.getPaymentStatus.bind(controller))

  fastify.post('/webhook', {
    schema: {
      tags: ['PayWay'],
      summary: 'PayWay webhook',
      description: 'Receive PayWay server-to-server payment callbacks.',
      body: {
        type: 'object',
        required: ['tran_id', 'status'],
        additionalProperties: true,
        properties: {
          tran_id: {
            type: 'string',
            minLength: 1,
            maxLength: 100
          },
          status: {
            anyOf: [
              { type: 'string', minLength: 1, maxLength: 50 },
              { type: 'number' }
            ]
          },
          apv: {
            type: 'string',
            minLength: 1,
            maxLength: 100
          },
          return_params: {
            type: 'string',
            minLength: 1,
            maxLength: 2000
          },
          hash: {
            type: 'string',
            minLength: 1,
            maxLength: 512
          }
        }
      }
    }
  }, controller.handleWebhook.bind(controller))

  fastify.get('/return', {
    schema: {
      tags: ['PayWay'],
      summary: 'Return page',
      description: 'Browser-facing success/processing page after PayWay returns control.'
    }
  }, controller.handleReturn.bind(controller))
  fastify.get('/cancel', {
    schema: {
      tags: ['PayWay'],
      summary: 'Cancel page',
      description: 'Browser-facing cancel page after the user cancels PayWay checkout.'
    }
  }, controller.handleCancel.bind(controller))
}

export default paymentRoutes
