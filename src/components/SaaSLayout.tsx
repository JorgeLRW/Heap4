import React, { useState, useEffect } from 'react';
import {
  FileText,
  BarChart3,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Send,
  Building2,
  DollarSign,
  Download,
  Layers,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  Bot,
  ExternalLink,
  Wrench,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { intentRuntime } from '../client/heap/intentRuntime';
import { Intent } from '../client/heap/intentTypes';

interface SaaSLayoutProps {
  onOpenRecoveryDrawer: (capsule: Intent) => void;
  onOpenRepairPanel: () => void;
}

export const SaaSLayout: React.FC<SaaSLayoutProps> = ({
  onOpenRecoveryDrawer,
  onOpenRepairPanel,
}) => {
  const [activeTab, setActiveTab] = useState<'invoices' | 'reports' | 'activity'>('invoices');
  const [activeIntents, setActiveIntents] = useState<Intent[]>([]);
  const [isExecutingSend, setIsExecutingSend] = useState(false);

  useEffect(() => {
    const update = () => {
      setActiveIntents(intentRuntime.getActiveIntents());
    };

    update();
    const unsub = intentRuntime.subscribe(update);
    return () => unsub();
  }, []);

  const invoiceIntent = intentRuntime.getIntent('int_2841');
  const isInvoiceCompleted = invoiceIntent?.status === 'completed';
  const isInvoiceInterrupted = invoiceIntent && invoiceIntent.status !== 'completed';
  const isInvoiceMitigated = invoiceIntent?.status === 'mitigated';
  const hasUsableGrant = intentRuntime.hasUsableAccessGrant();
  // The server rejects re-dispatching an intent that already moved past 'active'.
  const canDispatch = !invoiceIntent || invoiceIntent.status === 'active';

  // STEP 1, 2, 3: Send invoice workflow (Hits real DeliveryService.ts:42 failure!)
  const handleSendInvoice = async () => {
    if (!canDispatch) return;

    setIsExecutingSend(true);

    // Step 1: Create intent BEFORE the dangerous server call (§3)
    const newIntent: Intent = {
      id: 'int_2841',
      kind: 'send_invoice',
      actor: { userId: 'user_demo', workspaceId: 'acme_finance', role: 'member' },
      goal: {
        description: 'Acme Corp can access invoice INV-2841 ($4,850.00)',
        outcome: 'Acme Corp can read invoice INV-2841 for $4,850',
        successCondition:
          "invoice.deliveryStatus === 'sent' || (accessGrant.active && accessNoticeReceipt.sentAt exists) || procurementPortalReceipt.verifiedAt exists",
        primaryRoute: 'email_delivery',
        alternateRoutes: ['secure_share_link', 'procurement_portal'],
      },
      entities: {
        invoiceId: 'INV-2841',
        customerId: 'ACME',
        amount: 4850,
      },
      progress: {
        invoiceCreated: false,
        deliveryCompleted: false,
        completedSteps: ['Selected customer Acme Corp', 'Drafted INV-2841 ($4,850)'],
      },
      invariants: ['NEVER_DUPLICATE_INVOICE', 'NEVER_MODIFY_AMOUNT'],
      status: 'active',
      runtimeContext: null,
      history: [
        { timestamp: new Date().toLocaleTimeString(), note: 'Intent initialized before server dispatch.' },
      ],
    };

    intentRuntime.createIntent(newIntent);

    // Step 2 & 3: Real server request with intent ID header
    setTimeout(async () => {
      const result = await intentRuntime.executeSendInvoiceWorkflow('int_2841');
      setIsExecutingSend(false);
      onOpenRecoveryDrawer(result.intent);
    }, 450);
  };

  const handleReset = async () => {
    await intentRuntime.resetDemo();
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#090d16] text-slate-100 font-sans">
      {/* Sidebar (§1 Clean, un-telegraphed enterprise navigation) */}
      <aside className="w-64 bg-[#0d121f] border-r border-slate-800/80 flex flex-col justify-between shrink-0 select-none">
        <div>
          {/* Workspace Title */}
          <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-900/40">
                A
              </div>
              <div>
                <div className="font-semibold text-sm text-white tracking-tight">Acme Finance</div>
                <div className="text-[11px] text-slate-400 font-mono">Workspace: acme_finance</div>
              </div>
            </div>
          </div>

          {/* Navigation Items (Clean, natural labels) */}
          <nav className="p-3 space-y-1">
            <button
              onClick={() => setActiveTab('invoices')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                activeTab === 'invoices'
                  ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4" />
                <span>Invoices</span>
              </div>
              {isInvoiceInterrupted && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('reports')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                activeTab === 'reports'
                  ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4" />
                <span>Reports</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('activity')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                activeTab === 'activity'
                  ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Activity className="w-4 h-4" />
                <span>Activity</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">{activeIntents.length}</span>
            </button>
          </nav>
        </div>

        {/* Developer & Reset Footer */}
        <div className="p-3 border-t border-slate-800/80 space-y-2">
          <button
            onClick={onOpenRepairPanel}
            className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-indigo-300 rounded-xl text-xs font-mono transition-all border border-slate-800 flex items-center justify-center gap-2"
          >
            <Wrench className="w-3.5 h-3.5 text-indigo-400" />
            <span>Engineering Review ({intentRuntime.getCurrentBuild()})</span>
          </button>

          <button
            onClick={handleReset}
            className="w-full py-1.5 px-3 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-slate-200 rounded-xl text-[11px] font-mono transition-all border border-slate-800/60 flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Demo Baseline</span>
          </button>
        </div>
      </aside>

      {/* Main View Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header with Persistent Intent Indicator (§5 & §8) */}
        <header className="h-14 border-b border-slate-800/80 bg-slate-950/60 px-6 flex items-center justify-between shrink-0 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-400 font-mono uppercase tracking-wider">
              Acme Corp B2B Ledger
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* The Persistent Unfinished Intent Badge (§5 & §8) */}
            {activeIntents.length > 0 ? (
              <button
                onClick={() => onOpenRecoveryDrawer(activeIntents[0])}
                className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-full text-xs font-mono font-semibold hover:bg-amber-500/20 transition-all animate-pulse"
              >
                <span>↻</span>
                <span>{activeIntents.length} unfinished intent</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </button>
            ) : (
              <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                ✓ All workflows complete
              </span>
            )}
          </div>
        </header>

        {/* Tab 1: Invoices Screen (HERO DEMO §1) */}
        {activeTab === 'invoices' && (
          <main className="flex-1 overflow-y-auto p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">Invoice #INV-2841</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Customer: <strong className="text-slate-200">Acme Corp</strong> · Recipient:{' '}
                  <strong className="text-slate-200">billing@acme.example</strong>
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-mono font-semibold border ${
                    isInvoiceCompleted
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : isInvoiceMitigated
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      : isInvoiceInterrupted
                      ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  {isInvoiceCompleted
                    ? 'Sent ✓'
                    : isInvoiceMitigated
                    ? 'Shared via link · email still broken'
                    : isInvoiceInterrupted
                    ? 'Delivery interrupted'
                    : 'Draft'}
                </span>

                {canDispatch && (
                  <button
                    onClick={handleSendInvoice}
                    disabled={isExecutingSend}
                    className="py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold font-mono transition-all flex items-center gap-2 shadow-lg shadow-indigo-900/40"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {isExecutingSend ? 'Creating invoice & delivering...' : '[ Send invoice ]'}
                  </button>
                )}
              </div>
            </div>

            {/* Interruption Notice Banner if failed */}
            {isInvoiceInterrupted && invoiceIntent && (
              <div
                onClick={() => onOpenRecoveryDrawer(invoiceIntent)}
                className={`p-4 border rounded-2xl flex items-center justify-between cursor-pointer transition-all ${
                  isInvoiceMitigated
                    ? 'bg-amber-950/20 border-amber-500/30 hover:bg-amber-950/30'
                    : 'bg-rose-950/20 border-rose-500/30 hover:bg-rose-950/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <AlertCircle
                    className={`w-5 h-5 shrink-0 ${isInvoiceMitigated ? 'text-amber-400' : 'text-rose-400'}`}
                  />
                  <div className="text-xs">
                    <div
                      className={`font-bold font-mono ${isInvoiceMitigated ? 'text-amber-300' : 'text-rose-300'}`}
                    >
                      {isInvoiceMitigated
                        ? 'Outcome reached by share link · DeliveryService.ts:42 still failing'
                        : 'Server HTTP 500: Delivery dispatch failed (DeliveryService.ts:42)'}
                    </div>
                    <div className="text-slate-300 mt-0.5">
                      {isInvoiceMitigated
                        ? 'Acme Corp can read INV-2841 now. The invoice is not marked sent and the repair is still open.'
                        : 'Invoice INV-2841 exists in database. Heap 4 preserved intent and invariants.'}
                    </div>
                  </div>
                </div>
                <button className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs font-mono">
                  Inspect Recovery Drawer →
                </button>
              </div>
            )}

            {isInvoiceCompleted && hasUsableGrant && invoiceIntent && (
              <div
                onClick={() => onOpenRecoveryDrawer(invoiceIntent)}
                className="p-4 border rounded-2xl flex items-center justify-between cursor-pointer transition-all bg-amber-950/20 border-amber-500/30 hover:bg-amber-950/30"
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 shrink-0 text-amber-400" />
                  <div className="text-xs">
                    <div className="font-bold font-mono text-amber-300">
                      Primary delivery complete · temporary access still active
                    </div>
                    <div className="text-slate-300 mt-0.5">
                      Dana Lee's read-only grant remains usable and must be explicitly revoked.
                    </div>
                  </div>
                </div>
                <button className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs font-mono">
                  Review and revoke →
                </button>
              </div>
            )}

            {/* Deterministic Invoice Details Table (§1) */}
            <div className="bg-[#0d121f] border border-slate-800/90 rounded-2xl p-6 space-y-6 shadow-xl">
              <div className="grid grid-cols-3 gap-4 border-b border-slate-800 pb-5 text-xs font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Customer</span>
                  <span className="text-white font-bold text-sm">Acme Corp</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Invoice Number</span>
                  <span className="text-white font-bold text-sm">INV-2841</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Amount Due</span>
                  <span className="text-emerald-400 font-bold text-sm">$4,850.00 USD</span>
                </div>
              </div>

              <div className="space-y-3">
                <span className="text-xs font-semibold text-slate-300">Line Items</span>
                <table className="w-full text-xs font-mono text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500">
                      <th className="py-2">Description</th>
                      <th className="py-2">Qty</th>
                      <th className="py-2 text-right">Rate</th>
                      <th className="py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    <tr>
                      <td className="py-3 text-white">Enterprise API Ingestion Cluster (Q3)</td>
                      <td className="py-3">1</td>
                      <td className="py-3 text-right">$3,500.00</td>
                      <td className="py-3 text-right">$3,500.00</td>
                    </tr>
                    <tr>
                      <td className="py-3 text-white">Dedicated Support SLA & Telemetry</td>
                      <td className="py-3">1</td>
                      <td className="py-3 text-right">$1,350.00</td>
                      <td className="py-3 text-right">$1,350.00</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-700 font-bold text-white text-sm">
                      <td colSpan={3} className="py-3 text-right">Total:</td>
                      <td className="py-3 text-right text-emerald-400">$4,850.00</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </main>
        )}

        {/* Reports remains ordinary application context, not a second demo scenario. */}
        {activeTab === 'reports' && (
          <main className="flex-1 overflow-y-auto p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">Financial Reports</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Q3 2026 Cohort Aggregates & Revenue Reconciliation
                </p>
              </div>

              <button disabled className="py-2 px-4 bg-slate-800 text-slate-500 rounded-xl text-xs font-semibold font-mono flex items-center gap-2 cursor-not-allowed">
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>

            <div className="bg-[#0d121f] border border-slate-800/90 rounded-2xl p-6 text-xs font-mono text-slate-400 space-y-3">
              <div className="text-white font-bold text-sm font-sans">Q3 2026 Revenue Cohorts</div>
              <div>• Expected Records: <strong className="text-white">218</strong></div>
              <div>• Reconciled Revenue: <strong className="text-emerald-400">$1.28M</strong></div>
              <div>• Last Updated: <strong className="text-white">Today, 14:20</strong></div>
            </div>
          </main>
        )}

        {/* Tab 3: Activity Screen */}
        {activeTab === 'activity' && (
          <main className="flex-1 overflow-y-auto p-8 space-y-6">
            <h1 className="text-xl font-bold text-white tracking-tight">Activity Log</h1>
            <div className="space-y-3 font-mono text-xs">
              {intentRuntime.getAllIntents().map((intent) => (
                <div
                  key={intent.id}
                  onClick={() => onOpenRecoveryDrawer(intent)}
                  className="p-4 bg-[#0d121f] border border-slate-800 rounded-2xl flex items-center justify-between cursor-pointer hover:border-slate-700 transition-all"
                >
                  <div>
                    <div className="font-bold text-white">{intent.goal.description}</div>
                    <div className="text-slate-400 text-[11px]">ID: {intent.id} · Kind: {intent.kind}</div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                    intent.status === 'completed'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                  }`}>
                    {intent.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </main>
        )}
      </div>
    </div>
  );
};
