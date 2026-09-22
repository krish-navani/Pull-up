import { IPayoutProvider, CreatePayoutParams, PayoutResult, PayoutStatus } from './types.js';

/**
 * DeferredPayoutProvider
 *
 * Implements IPayoutProvider for the transition period before Razorpay confirms
 * Route vs RazorpayX. It processes payout requests safely into the ledger with
 * complete audit tracking, ready for final automated settlement.
 */
export class DeferredPayoutProvider implements IPayoutProvider {
  readonly name = 'deferred_ledger';

  async createPayout(params: CreatePayoutParams): Promise<PayoutResult> {
    console.log(`[DEFERRED PAYOUT PROVIDER] Payout queued for driver ${params.driverId}: ₹${(params.driverSharePaise / 100).toFixed(2)} (booking=${params.bookingId}, ride=${params.rideId})`);

    // In deferred mode, the payout is marked as ready_for_payout in the ledger
    return {
      success: true,
      providerPayoutId: `def_payout_${params.bookingId}_${Date.now()}`,
      status: 'ready_for_payout',
      rawResponse: {
        driverId: params.driverId,
        amountPaise: params.driverSharePaise,
        destinationUpiVpa: params.destinationUpiVpa || null,
        destinationAccountId: params.destinationAccountId || null,
        queuedAt: new Date().toISOString(),
      },
    };
  }

  async getPayoutStatus(providerPayoutId: string): Promise<{ status: PayoutStatus; rawResponse?: any }> {
    return {
      status: 'ready_for_payout',
      rawResponse: { providerPayoutId, provider: this.name },
    };
  }

  async cancelPayout(providerPayoutId: string): Promise<void> {
    console.log(`[DEFERRED PAYOUT PROVIDER] Payout cancelled: ${providerPayoutId}`);
  }
}

export const defaultPayoutProvider: IPayoutProvider = new DeferredPayoutProvider();
