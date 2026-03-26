export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED'

export interface PaywayPurchaseRequest {
  req_time: string
  merchant_id: string
  tran_id: string
  amount: number
  currency: string
  firstname?: string
  lastname?: string
  email?: string
  phone?: string
  payment_option?: string
  return_params?: string
  return_url?: string
  cancel_url?: string
}

export interface CreateHostedCheckoutInput {
  amount: number
  currency?: string
  paymentOption?: string
  phone?: string
  returnParams?: string
}

export interface PaywayPurchaseResponse {
  status?: {
    code?: string | number
    message?: string
    tran_id?: string
    pw_tran_id?: string
    [key: string]: unknown
  }
  description?: string
  qrString?: string
  qrImage?: string
  abapay_deeplink?: string
  app_store?: string
  play_store?: string
  [key: string]: unknown
}

export interface PaymentSummary {
  id: string
  tranId: string
  amount: number
  currency: string
  status: PaymentStatus
  createdAt: string
  updatedAt: string
}

export interface PaywayCheckoutData {
  kind: 'qr'
  qrString?: string
  qrImage?: string
  deepLink?: string
  appStoreUrl?: string
  playStoreUrl?: string
  providerMessage?: string
}

export interface PaywayCreatePaymentResult {
  payment: PaymentSummary
  checkout: PaywayCheckoutData
  providerResponse: PaywayPurchaseResponse
}

export interface PaywayHostedCheckoutResult {
  payment: PaymentSummary
  checkoutHtml: string
  checkoutPayload: Record<string, unknown>
}

export interface PaywayHostedCheckoutSessionResult {
  payment: PaymentSummary
}

export interface PaywayCallbackPayload {
  tran_id: string
  status: string | number
  apv?: string
  return_params?: string
  [key: string]: unknown
}

export interface PaywayCheckTransactionResponse {
  data?: {
    payment_status_code?: number | string
    payment_status?: string
    total_amount?: number
    payment_currency?: string
    apv?: string
    transaction_date?: string
    [key: string]: unknown
  }
  status?: {
    code?: string
    message?: string
    tran_id?: string
    [key: string]: unknown
  }
}

export interface PaymentProviderState {
  purchaseRequest?: PaywayPurchaseRequest
  purchase?: PaywayPurchaseResponse
  callback?: PaywayCallbackPayload
  verification?: PaywayCheckTransactionResponse
  lastError?: Record<string, unknown>
}
