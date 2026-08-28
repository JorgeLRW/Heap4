/**
 * InvoiceService.ts
 * Manages database persistence and transactional workflow for invoices.
 */

import { DeliveryService, Invoice } from './DeliveryService';

export interface InvoiceDatabaseRecord {
  id: string;
  customerId: string;
  amount: number;
  recipient: string;
  exists: boolean;
  deliveryStatus: 'pending' | 'sent' | 'failed';
  createdAt: string;
  sentAt?: string;
}

export class InvoiceService {
  private static db = new Map<string, InvoiceDatabaseRecord>();

  public static seedInitialData() {
    this.db.clear();
    DeliveryService.resetToInitialBuild();
  }

  public static getInvoice(id: string): InvoiceDatabaseRecord | undefined {
    return this.db.get(id);
  }

  /**
   * Step 1: Creates invoice in database if not already created.
   * Enforces invariant: NEVER_DUPLICATE_INVOICE.
   */
  public static async createInvoice(invoiceId: string, customerId: string, amount: number, recipient: string): Promise<InvoiceDatabaseRecord> {
    const existing = this.db.get(invoiceId);
    if (existing) {
      console.warn(`[InvoiceService] Invariant check: Invoice ${invoiceId} already exists. Re-use existing record.`);
      return existing;
    }

    const record: InvoiceDatabaseRecord = {
      id: invoiceId,
      customerId,
      amount,
      recipient,
      exists: true,
      deliveryStatus: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.db.set(invoiceId, record);
    console.log(`[InvoiceService] Created invoice ${invoiceId} in database.`);
    return record;
  }

  /**
   * Step 2: Dispatches delivery using DeliveryService.
   */
  public static async dispatchInvoice(invoiceId: string): Promise<InvoiceDatabaseRecord> {
    const invoice = this.db.get(invoiceId);
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} does not exist.`);
    }

    // Call external delivery provider
    const result = await DeliveryService.sendInvoiceDelivery(invoice);
    if (result.success) {
      invoice.deliveryStatus = 'sent';
      invoice.sentAt = new Date().toISOString();
    }

    return invoice;
  }
}
