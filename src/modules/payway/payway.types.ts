export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED'

export interface PaywayLogEntry {
  event: string
  timestamp: string
  details?: Record<string, unknown>
}

export interface PaywayPurchaseRequest {
  req_time: string
  merchant_id: string
  tran_id: string
  amount: number
  items?: string
  shipping?: number
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
}

export interface PaywayCheckoutPageResult {
  html: string
}

export interface PaywayPurchaseResponse {
  html: string
}

export interface PaywayTransactionData {
  payment_status_code?: number | string
  payment_status?: string
  total_amount?: number | string
  payment_currency?: string
  apv?: string
  transaction_date?: string
  [key: string]: unknown
}

export interface PaywayCallbackPayload {
  tran_id: string
  status: string | number
  apv?: string
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
  callback?: PaywayCallbackPayload
  verification?: PaywayCheckTransactionResponse
  lastError?: Record<string, unknown>
  logs?: PaywayLogEntry[]
}
