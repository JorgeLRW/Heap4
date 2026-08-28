import type { Intent } from '../src/client/heap/intentTypes';

export function createInvoiceIntent(): Intent {
  return {
    id: 'int_2841',
    kind: 'send_invoice',
    actor: { userId: 'user_demo', workspaceId: 'acme_finance', role: 'member' },
    goal: {
      description: 'Acme Corp can access invoice INV-2841',
      successCondition: "invoice.deliveryStatus === 'sent'",
    },
    entities: { invoiceId: 'INV-2841', customerId: 'ACME', amount: 4850 },
    progress: { invoiceCreated: false, deliveryCompleted: false, completedSteps: [] },
    invariants: ['NEVER_DUPLICATE_INVOICE', 'NEVER_MODIFY_AMOUNT'],
    status: 'active',
    runtimeContext: null,
    history: [],
  };
}
