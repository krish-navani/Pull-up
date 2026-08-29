declare module 'react-native-razorpay' {
  export interface RazorpayOptions {
    key: string;
    amount: number | string;
    currency?: string;
    name?: string;
    description?: string;
    image?: string;
    order_id?: string;
    subscription_id?: string;
    prefill?: {
      name?: string;
      email?: string;
      contact?: string;
    };
    notes?: Record<string, string>;
    theme?: {
      color?: string;
      hide_topbar?: boolean;
    };
    timeout?: number;
    readonly?: {
      email?: boolean;
      contact?: boolean;
      name?: boolean;
    };
  }

  export interface RazorpayPaymentSuccess {
    razorpay_payment_id: string;
    razorpay_order_id?: string;
    razorpay_subscription_id?: string;
    razorpay_signature?: string;
  }

  export interface RazorpayPaymentError {
    code?: number;
    description?: string;
    source?: string;
    step?: string;
    reason?: string;
    metadata?: {
      order_id?: string;
    subscription_id?: string;
      payment_id?: string;
    };
  }

  export default class RazorpayCheckout {
    static open(options: RazorpayOptions): Promise<RazorpayPaymentSuccess>;
  }
}