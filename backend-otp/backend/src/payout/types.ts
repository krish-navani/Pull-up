import admin from 'firebase-admin';

export type PayoutStatus =
  | 'pending_completion'  // Passenger paid; ride is ongoing; funds held until ride completion
  | 'ready_for_payout'    // Ride successfully completed; ready to be transferred to driver
  | 'processing'          // Payout dispatched to provider, awaiting provider completion
  | 'paid'                // Successfully paid out to driver
  | 'voided'              // Cancelled / refunded before payout; driver will not receive funds
  | 'failed';             // Payout attempt failed; eligible for retry

export type RefundReason =
  | 'driver_cancelled'
  | 'passenger_cancelled'
  | 'driver_no_show'
  | 'passenger_no_pickup'
  | 'ride_cancelled'
  | 'payment_failed'
  | 'admin_override'
  | 'other';

export type RefundStatus =
  | 'initiated'
  | 'processed'
  | 'failed';

export interface PayoutRecord {
  id: string; // doc ID, e.g. payout_<bookingId>
  bookingId: string;
  rideId: string;
  driverId: string;
  passengerId: string;
  paymentId: string;
  orderId: string;
  amountPaise: number;         // Total passenger payment (e.g. 5000 = ₹50)
  driverSharePaise: number;    // Driver earnings (e.g. 4000 = ₹40)
  platformFeePaise: number;    // PullUp fee (e.g. 1000 = ₹10)
  currency: 'INR';
  status: PayoutStatus;
  provider: string;            // 'deferred' | 'razorpay_route' | 'razorpayx'
  providerPayoutId?: string | null;
  failureReason?: string | null;
  retryCount: number;
  voidedReason?: string | null;
  voidedAt?: admin.firestore.Timestamp | null;
  clearedAt?: admin.firestore.Timestamp | null;
  paidAt?: admin.firestore.Timestamp | null;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface RefundRecord {
  id: string; // doc ID, e.g. ref_<bookingId>_<timestamp>
  bookingId: string;
  rideId: string;
  passengerId: string;
  driverId: string;
  paymentId: string;
  orderId?: string;
  amountPaise: number;
  reason: RefundReason;
  status: RefundStatus;
  razorpayRefundId?: string | null;
  failureReason?: string | null;
  initiatedBy: string; // userId or 'system'
  createdAt: admin.firestore.Timestamp;
  processedAt?: admin.firestore.Timestamp | null;
  updatedAt: admin.firestore.Timestamp;
}

export interface CreatePayoutParams {
  payoutId: string;
  bookingId: string;
  rideId: string;
  driverId: string;
  driverSharePaise: number;
  currency: string;
  destinationUpiVpa?: string | null;
  destinationAccountId?: string | null;
  notes?: Record<string, string>;
}

export interface PayoutResult {
  success: boolean;
  providerPayoutId?: string;
  status: PayoutStatus;
  rawResponse?: any;
  error?: string;
}

export interface IPayoutProvider {
  readonly name: string;
  createPayout(params: CreatePayoutParams): Promise<PayoutResult>;
  getPayoutStatus(providerPayoutId: string): Promise<{ status: PayoutStatus; rawResponse?: any }>;
  cancelPayout?(providerPayoutId: string): Promise<void>;
}
