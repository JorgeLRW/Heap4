/**
 * The deliberately reproducible delivery defect used by the hackathon vertical.
 * Build A is the failing production path; Build B is the reviewed repair.
 */

export interface InvoiceToDeliver {
  id: string;
  recipient: string;
  amount: number;
}

export interface DeliveryReceipt {
  invoiceId: string;
  recipient: string;
  deliveredAt: string;
  provider: 'mail.acme.example';
}

export class DeliveryProviderConfigurationError extends Error {
  readonly code = 'DELIVERY_PROVIDER_CONFIGURATION_ERROR';

  constructor() {
    super('Missing TLS cert for outbound gateway mail.acme.example:587');
    this.name = 'DeliveryProviderConfigurationError';
  }
}

/**
 * This is the application boundary the server actually executes. Keeping the
 * defect here (rather than only in a state transition) makes the failure
 * reproducible in unit tests and gives the repair artifact a real source file.
 */
export function sendInvoiceDelivery(
  invoice: InvoiceToDeliver,
  build: 'demo-build-a' | 'demo-build-b',
): DeliveryReceipt {
  if (build === 'demo-build-a') {
    // Intentional hackathon fixture: the outbound provider is misconfigured.
    // The failing build remains reproducible for the end-to-end test.
    // The reviewed repair removes this branch in demo-build-b.
    // This is the source context surfaced to the browser agent.
    throw new DeliveryProviderConfigurationError();
  }

  return {
    invoiceId: invoice.id,
    recipient: invoice.recipient,
    deliveredAt: new Date().toISOString(),
    provider: 'mail.acme.example',
  };
}

/** Compatibility facade for the older in-process service harness. */
export interface Invoice extends InvoiceToDeliver {
  customerId?: string;
  deliveryStatus: 'pending' | 'sent' | 'failed';
  sentAt?: string;
}

export class DeliveryService {
  private static activeBuild: 'demo-build-a' | 'demo-build-b' = 'demo-build-a';

  static isFailureEnabled(): boolean {
    return this.activeBuild === 'demo-build-a';
  }

  static getCurrentBuild(): string {
    return this.activeBuild;
  }

  static deployRepairedBuild(): string {
    this.activeBuild = 'demo-build-b';
    return this.activeBuild;
  }

  static resetToInitialBuild(): void {
    this.activeBuild = 'demo-build-a';
  }

  static setBuild(build: 'demo-build-a' | 'demo-build-b'): void {
    this.activeBuild = build;
  }

  static async sendInvoiceDelivery(invoice: Invoice): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    try {
      const receipt = sendInvoiceDelivery(invoice, this.activeBuild);
      return { success: true, messageId: `msg_${receipt.deliveredAt}` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
