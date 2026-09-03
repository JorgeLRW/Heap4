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
  /** What the user needs, stated independently of how the app happens to deliver it. */
  outcome: string;
  successCondition: string; // satisfied by the primary route or an allowlisted alternate
  primaryRoute: GoalRoute;
  alternateRoutes: GoalRoute[];
}

/** How a goal's outcome can be reached. A broken route is not a lost goal. */
export type GoalRoute = 'email_delivery' | 'secure_share_link' | 'procurement_portal';

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
  /** Records which route actually reached the outcome, once one did. */
  goalSatisfiedVia?: GoalRoute;
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

/**
 * `mitigated` means the user's outcome was reached through an alternate route
 * while the primary route is still broken. It is deliberately distinct from
 * `completed`, which requires the primary route to work.
 */
export type IntentStatus =
  | 'active'
  | 'interrupted'
  | 'blocked'
  | 'mitigated'
  | 'resumable'
  | 'completed';

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
