import type { Intent } from '../src/client/heap/intentTypes';

export function createInvoiceIntent(): Intent {
  return {
    id: 'int_2841',
    kind: 'send_invoice',
    actor: { userId: 'user_demo', workspaceId: 'acme_finance', role: 'member' },
    goal: {
      description: 'Acme Corp can access invoice INV-2841',
      outcome: 'Acme Corp can read invoice INV-2841 for $4,850',
      successCondition:
        "invoice.deliveryStatus === 'sent' || invoice.accessGrantedVia === 'secure_share_link'",
      primaryRoute: 'email_delivery',
      alternateRoutes: ['secure_share_link'],
    },
    entities: { invoiceId: 'INV-2841', customerId: 'ACME', amount: 4850 },
    progress: { invoiceCreated: false, deliveryCompleted: false, completedSteps: [] },
    invariants: ['NEVER_DUPLICATE_INVOICE', 'NEVER_MODIFY_AMOUNT'],
    status: 'active',
    runtimeContext: null,
    history: [],
  };
}
