import "server-only";
import { ApiError } from "@/lib/shared/errors";
import { appOrigin } from "../config";
import { createFinikPayment } from "./finik";

export interface PaymentRequest {
  orderId: string;
  /** Unique per attempt, at most 36 chars (UUID). */
  paymentId: string;
  /** Where the buyer lands after paying. */
  returnUrl: string;
  amountKgs: number;
  description: string;
}

export interface PaymentSession {
  /** Where the buyer is sent to pay. */
  url: string;
  providerRef: string | null;
}

export interface PaymentProvider {
  readonly name: string;
  createPayment(req: PaymentRequest): Promise<PaymentSession>;
}

/**
 * Test provider: the "payment page" is our own /pay/mock/<order>. It must never be
 * reachable in production by accident, so it is only active when PAYMENTS_PROVIDER=mock.
 */
const mockProvider: PaymentProvider = {
  name: "mock",
  async createPayment(req) {
    return { url: `${appOrigin()}/pay/mock/${encodeURIComponent(req.orderId)}`, providerRef: `mock-${req.orderId}` };
  },
};

/** Finik QR payment: see ./finik.ts (signed create-payment call, signed status callback). */
const finikProvider: PaymentProvider = { name: "finik", createPayment: createFinikPayment };

export function paymentProvider(): PaymentProvider {
  switch (process.env.PAYMENTS_PROVIDER) {
    case "mock":
      return mockProvider;
    case "finik":
      return finikProvider;
    default:
      throw new ApiError("TEMPORARY_UNAVAILABLE", "Онлайн-оплата пока недоступна");
  }
}
