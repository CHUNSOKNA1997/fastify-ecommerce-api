export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED'

export interface PaywayLogEntry {
  event: string
  timestamp: string
  details?: Record<string, unknown>
}

export interface PaywayPurchaseRequest {
  req_time: string
  merchant_id: string
  tran_id: string
  amount: string
  items?: string
  shipping?: string
  ctid?: string
  pwt?: string
  firstname?: string
  lastname?: string
  email?: string
  phone?: string
  type?: string
  payment_option?: string
  currency: string
  return_params: string
  return_url?: string
  cancel_url?: string
  continue_success_url?: string
  return_deeplink?: string
  custom_fields?: string
  payout?: string
  lifetime?: string
  additional_params?: string
  google_pay_token?: string
  skip_success_page?: string
  payment_gate?: string
}

export interface CreateCheckoutInput {
  amount: number
  orderId: string
}

export interface PaymentSummary {
  id: string
  orderId: string
  tranId: string
  amount: number
  currency: string
  status: PaymentStatus
  createdAt: string
  updatedAt: string
}

export interface CreateCheckoutResult {
  payment: PaymentSummary
  checkoutUrl: string
  purchaseUrl: string
  purchasePayload: PaywayPurchaseRequest & { hash: string }
  expiresAt: string
}

export interface PaywayCheckoutPageResult {
  html: string
}

export interface PaymentStatusResult {
  payment: PaymentSummary
  expiresAt?: string
}

export interface PaywayPurchaseApiResponse {
  status?: {
    code?: string
    message?: string
    tran_id?: string
    [key: string]: unknown
  }
  description?: string
  qrString?: string
  qrImage?: string
  data?: {
    image?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface PaywayTransactionData {
  payment_status_code?: number | string
  payment_status?: string
  total_amount?: number | string
  payment_currency?: string
  amount?: number | string
  currency?: string
  apv?: string
  transaction_date?: string
  [key: string]: unknown
}

export interface PaywayCallbackPayload {
  tran_id: string
  status: string | number
  apv?: string
  payment_status?: string | number
  payment_option?: string
  amount?: string | number
  currency?: string
  merchant_id?: string
  items?: string
  custom_fields?: string
  return_params?: string
  hash?: string
  [key: string]: unknown
}

export interface PaywayCheckTransactionResponse {
  data?: PaywayTransactionData
  status?: {
    code?: string
    message?: string
    tran_id?: string
    [key: string]: unknown
  }
}

export interface PaymentProviderState {
  purchaseRequest?: PaywayPurchaseRequest
  checkoutHtml?: string
  checkoutExpiresAt?: string
  callback?: PaywayCallbackPayload
  verification?: PaywayCheckTransactionResponse
  lastError?: Record<string, unknown>
  logs?: PaywayLogEntry[]
}
