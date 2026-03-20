import axios from "axios";
import { PaymentRepository } from "./payment.respositoty";
import { generateHash } from "../../plugins/generate.hash";

export class PaymentService {
  private repo = new PaymentRepository();

  async createPayment(userId: string, amount: number) {
    const tranId = `order-${Date.now()}`;

    const payment = await this.repo.create({
      userId,
      tranId,
      amount,
    });

    const data = {
      req_time: Date.now(),
      merchant_id: process.env.PAYWAY_MERCHANT_ID!,
      tran_id: tranId,
      amount,
      currency: "USD",
      return_url: "yourapp://payment-success",
      cancel_url: "yourapp://payment-cancel",
    };

    const hash = generateHash(data, process.env.PAYWAY_API_KEY!);

    const res = await axios.post(
      `${process.env.PAYWAY_API_KEY}`,
      {
        ...data,
        hash,
      }
    );

    return {
      payment,
      paymentUrl: res.data.payment_url,
    };
  }

  async handleCallback(payload: any) {
    const { tran_id, status } = payload;

    const payment = await this.repo.findByTranId(tran_id);
    if (!payment) throw new Error("Payment not found");

    if (payment.status === "PAID") return;

    if (status === 0) {
      await this.repo.markAsPaid(tran_id, payload);
    } else {
      await this.repo.markAsFailed(tran_id, payload);
    }
  }
}