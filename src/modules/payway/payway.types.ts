export interface PaywayPurchaseRequest {
  req_time: string
  merchant_id: string
  tran_id: string
  amount: number
  currency: string
  return_url: string
  cancel_url: string
}

export interface PaywayCreatePaymentResult {
  payment: unknown
  checkoutHtml: string
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
