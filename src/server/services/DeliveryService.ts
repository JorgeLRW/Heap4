/**
 * DeliveryService.ts
 * Handles external SMTP and transactional delivery dispatch for invoices.
 */

export interface Invoice {
  id: string;
  customerId: string;
  amount: number;
  recipient: string;
  deliveryStatus: 'pending' | 'sent' | 'failed';
}

export class DeliveryService {
  private static demoFailureEnabled: boolean = true;
  private static currentBuild: string = 'demo-build-a';

  public static isFailureEnabled(): boolean {
    return this.demoFailureEnabled;
  }

  public static getCurrentBuild(): string {
    return this.currentBuild;
  }

  public static deployRepairedBuild(): string {
    this.demoFailureEnabled = false;
    this.currentBuild = 'demo-build-b';
    console.log('[Deployment] Successfully deployed repaired build demo-build-b');
    return this.currentBuild;
  }

  public static resetToInitialBuild(): void {
    this.demoFailureEnabled = true;
    this.currentBuild = 'demo-build-a';
  }

  /**
   * Dispatches email delivery for an invoice.
   * Line 42 contains the deliberate configuration defect in demo-build-a.
   */
  public static async sendInvoiceDelivery(invoice: Invoice): Promise<{ success: boolean; messageId?: string }> {
    // Check delivery provider configuration
    if (this.demoFailureEnabled) {
      // LINE 42: Simulated configuration failure in demo-build-a
      const err = new Error('DELIVERY_PROVIDER_CONFIGURATION_ERROR: Missing TLS cert for outbound gateway mail.acme.example:587');
      err.name = 'DeliveryConfigurationException';
      throw err;
    }

    // In demo-build-b, delivery succeeds safely
    invoice.deliveryStatus = 'sent';
    return {
      success: true,
      messageId: `msg_${Date.now()}_inv_2841`,
    };
  }
}
