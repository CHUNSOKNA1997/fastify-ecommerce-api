import { FastifyPluginAsync } from 'fastify'
import { PaymentController } from './payment.controller'

const paymentRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const controller = new PaymentController()

  fastify.post('/create-checkout', {
    schema: {
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

  fastify.post('/webhook', {
    schema: {
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

  fastify.get('/return', controller.handleReturn.bind(controller))
  fastify.get('/cancel', controller.handleCancel.bind(controller))
}

export default paymentRoutes
