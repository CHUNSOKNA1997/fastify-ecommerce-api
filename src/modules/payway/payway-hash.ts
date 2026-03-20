import crypto from 'node:crypto'

export function buildPaywayHashPayload<T extends object>(data: T): string {
  const entries = data as Record<string, unknown>

  return Object.keys(entries)
    .sort()
    .map((key) => `${key}=${String(entries[key] ?? '')}`)
    .join('&')
}

export function generatePaywayHash<T extends object>(data: T, apiKey: string): string {
  return crypto
    .createHmac('sha512', apiKey)
    .update(buildPaywayHashPayload(data))
    .digest('base64')
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
