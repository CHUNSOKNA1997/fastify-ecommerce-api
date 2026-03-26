import crypto from 'node:crypto'

function toPaywayHashValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value)
}

export function buildPaywayHashPayload(values: unknown[]): string {
  return values.map(toPaywayHashValue).join('')
}

export function buildPaywayHashValues<T extends object>(data: T, orderedKeys: Array<keyof T>): string[] {
  return orderedKeys
    .filter((key) => data[key] !== null && data[key] !== undefined)
    .map((key) => toPaywayHashValue(data[key]))
}

export function generatePaywayHash(values: unknown[], apiKey: string): string {
  return crypto
    .createHmac('sha512', apiKey)
    .update(buildPaywayHashPayload(values))
    .digest('base64')
}

export function generatePaywayCallbackSignature(data: Record<string, unknown>, apiKey: string): string {
  const values = Object.keys(data)
    .sort()
    .map((key) => {
      const value = data[key]
      if (value !== null && typeof value === 'object') {
        return JSON.stringify(value)
      }

      return toPaywayHashValue(value)
    })

  return generatePaywayHash(values, apiKey)
}

export function verifyPaywayCallbackSignature(
  data: Record<string, unknown>,
  apiKey: string,
  receivedSignature: string
): boolean {
  const normalizedSignature = receivedSignature.trim()
  if (normalizedSignature.length === 0) {
    return false
  }

  const expectedSignature = generatePaywayCallbackSignature(data, apiKey)
  if (expectedSignature.length !== normalizedSignature.length) {
    return false
  }

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'utf8'),
    Buffer.from(normalizedSignature, 'utf8')
  )
}

export function getPaywayRequestTime(date = new Date()): string {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${year}${month}${day}${hours}${minutes}${seconds}`
}

export function generatePaywayTransactionId(now = Date.now()): string {
  const timestamp = String(now)
  const randomSuffix = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')

  return `${timestamp}${randomSuffix}`.slice(0, 20)
}

export function encodePaywayUrl(url: string): string {
  return Buffer.from(url).toString('base64')
}
