import crypto from 'node:crypto'
import type { PaywayCallbackPayload, PaywayPurchaseRequest } from './payway.types'

const PURCHASE_HASH_ORDER: Array<keyof PaywayPurchaseRequest> = [
  'req_time',
  'merchant_id',
  'tran_id',
  'amount',
  'items',
  'shipping',
  'firstname',
  'lastname',
  'email',
  'phone',
  'type',
  'payment_option',
  'return_url',
  'cancel_url',
  'continue_success_url',
  'return_deeplink',
  'currency',
  'custom_fields',
  'return_params',
  'payout',
  'lifetime',
  'additional_params',
  'google_pay_token',
  'skip_success_page'
]

const CALLBACK_HASH_ORDER: Array<keyof PaywayCallbackPayload> = [
  'tran_id',
  'status',
  'apv',
  'payment_status',
  'payment_option',
  'amount',
  'currency',
  'merchant_id',
  'items',
  'custom_fields',
  'return_params'
]

function normalizeHashValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value)
}

export function buildRequestTime(date = new Date()): string {
  const year = String(date.getUTCFullYear())
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')

  return `${year}${month}${day}${hours}${minutes}${seconds}`
}

export function generateTransactionId(now = Date.now()): string {
  const randomSuffix = crypto.randomInt(100000, 999999)
  return `PAY${now}${randomSuffix}`.slice(0, 20)
}

export function generateHmacSha512(payload: string, apiKey: string): string {
  return crypto.createHmac('sha512', apiKey).update(payload).digest('base64')
}

export function generatePurchaseHash(request: PaywayPurchaseRequest, apiKey: string): string {
  const payload = PURCHASE_HASH_ORDER
    .map((key) => normalizeHashValue(request[key]))
    .join('')

  return generateHmacSha512(payload, apiKey)
}

export function generateTransactionDetailHash(
  reqTime: string,
  merchantId: string,
  tranId: string,
  apiKey: string
): string {
  return generateHmacSha512(`${reqTime}${merchantId}${tranId}`, apiKey)
}

export function encodeBase64Value(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

export function extractCallbackSignature(
  payload: PaywayCallbackPayload,
  headerValue?: string
): string | undefined {
  if (headerValue?.trim()) {
    return headerValue.trim()
  }

  if (typeof payload.hash === 'string' && payload.hash.trim().length > 0) {
    return payload.hash.trim()
  }

  return undefined
}

export function generateCallbackHash(payload: PaywayCallbackPayload, apiKey: string): string {
  const body = CALLBACK_HASH_ORDER
    .map((key) => {
      const value = payload[key]
      if (value !== null && typeof value === 'object') {
        return JSON.stringify(value)
      }

      return normalizeHashValue(value)
    })
    .join('')

  return generateHmacSha512(body, apiKey)
}

export function verifyCallbackHash(
  payload: PaywayCallbackPayload,
  apiKey: string,
  receivedSignature?: string
): boolean {
  if (!receivedSignature) {
    return false
  }

  const expectedSignature = generateCallbackHash(payload, apiKey)
  if (expectedSignature.length !== receivedSignature.length) {
    return false
  }

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'utf8'),
    Buffer.from(receivedSignature, 'utf8')
  )
}
