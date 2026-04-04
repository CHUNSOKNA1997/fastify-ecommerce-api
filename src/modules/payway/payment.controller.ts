import type { FastifyReply, FastifyRequest } from 'fastify'
import { PaymentService } from './payment.service'
import type { CreateCheckoutInput, PaywayCallbackPayload } from './payway.types'

export class PaymentController {
  constructor(private readonly paymentService = new PaymentService()) {}

  async createCheckout(
    request: FastifyRequest<{ Body: CreateCheckoutInput }>,
    reply: FastifyReply
  ) {
    const result = await this.paymentService.createCheckout(
      request.body,
      this.getBaseUrl(request)
    )

    reply.code(201)
    return {
      payment: result.payment,
      checkout_url: result.checkoutUrl,
      purchase_url: result.purchaseUrl,
      purchase_payload: result.purchasePayload,
      expires_at: result.expiresAt
    }
  }

  async getCheckoutPage(
    request: FastifyRequest<{ Params: { paymentId: string } }>,
    reply: FastifyReply
  ) {
    const result = await this.paymentService.getCheckoutPage(request.params.paymentId, request.log)
    reply.type('text/html; charset=utf-8')
    return result.html
  }

  async handleWebhook(
    request: FastifyRequest<{ Body: PaywayCallbackPayload }>,
    reply: FastifyReply
  ) {
    const signatureHeader = this.readHeader(request.headers['x-payway-hmac-sha512'])
      ?? this.readHeader(request.headers['x-payway-signature'])

    const payment = await this.paymentService.processWebhook(
      request.body,
      signatureHeader,
      request.log
    )

    reply.code(200)
    return {
      message: 'Webhook processed',
      payment
    }
  }

  async getPaymentStatus(
    request: FastifyRequest<{ Params: { paymentId: string } }>,
    reply: FastifyReply
  ) {
    const result = await this.paymentService.getPaymentStatus(request.params.paymentId)
    reply.code(200)
    return {
      payment: result.payment,
      expires_at: result.expiresAt
    }
  }

  async handleReturn(_: FastifyRequest, reply: FastifyReply) {
    reply.type('text/html; charset=utf-8')
    return this.renderInfoPage('Payment is being processed. Please wait for webhook confirmation.')
  }

  async handleCancel(_: FastifyRequest, reply: FastifyReply) {
    reply.type('text/html; charset=utf-8')
    return this.renderInfoPage('Payment was cancelled. You can close this page and try again.')
  }

  private getBaseUrl(request: FastifyRequest): string {
    const forwardedProto = this.readHeader(request.headers['x-forwarded-proto'])
    const forwardedHost = this.readHeader(request.headers['x-forwarded-host'])
    const protocol = forwardedProto || request.protocol
    const host = forwardedHost || this.readHeader(request.headers.host)

    if (!host) {
      throw new Error('Unable to determine request host')
    }

    return `${protocol}://${host}`
  }

  private readHeader(header: string | string[] | undefined): string | undefined {
    if (Array.isArray(header)) {
      return header[0]
    }

    return header
  }

  private renderInfoPage(message: string): string {
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Payment Status</title>
  </head>
  <body>
    <p>${message}</p>
  </body>
</html>`
  }
}
