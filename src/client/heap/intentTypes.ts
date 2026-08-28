/**
 * intentTypes.ts
 * Authoritative Heap 4 Intent Definition
 */

export interface IntentActor {
  userId: string;
  workspaceId: string;
  role?: 'member' | 'admin' | 'owner';
}

export interface IntentGoal {
  description: string; // e.g. "Acme Corp can access invoice INV-2841"
  successCondition: string; // e.g. "invoice.deliveryStatus === 'sent'"
}

export interface IntentEntities {
  invoiceId: string;
  customerId: string;
  amount: number;
  [key: string]: any;
}

export interface IntentProgress {
  invoiceCreated: boolean;
  deliveryCompleted: boolean;
  completedSteps: string[];
  failedStep?: string;
  gap?: string;
}

export interface RuntimeContext {
  request: {
    id: string; // e.g. "req_7192"
    route: string; // e.g. "POST /api/invoices/INV-2841/send"
    httpStatus: number; // e.g. 500
  };
  stack: string[]; // ["DeliveryService.sendInvoiceDelivery", "InvoiceService.dispatch"]
  source: {
    file: string; // "src/server/services/DeliveryService.ts"
    line: number; // 42
    symbol: string; // "sendInvoiceDelivery"
    snippet?: string;
    linesRange?: string;
  };
  build: string; // "demo-build-a" | "demo-build-b"
  timestamp: string;
}

export type IntentStatus = 'active' | 'interrupted' | 'blocked' | 'resumable' | 'completed';

export interface Intent {
  id: string; // "int_2841"
  kind: 'send_invoice' | 'export_report';
  actor: IntentActor;
  goal: IntentGoal;
  entities: IntentEntities;
  progress: IntentProgress;
  invariants: string[]; // ["NEVER_DUPLICATE_INVOICE", "NEVER_MODIFY_AMOUNT"]
  status: IntentStatus;
  detectionSource?: 'SERVER_ERROR' | 'GOAL_VERIFICATION' | 'USER_REPORT';
  runtimeContext: RuntimeContext | null;
  userContext?: Array<{
    timestamp: string;
    text: string;
    source: 'user' | 'agent';
  }>;
  history: Array<{ timestamp: string; note: string }>;
}

export interface ToolActivityRecord {
  timestamp: string;
  toolName: string;
  parameters: Record<string, any>;
  result: any;
  latencyMs: number;
  readOnly: boolean;
}
