import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Sparkles,
  ArrowRight,
  Code,
  Shield,
  Layers,
  FileText,
  Clock,
  Check,
  RotateCcw,
  Bot,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  ShieldCheck,
  Play,
  Terminal,
  Cpu,
  FileCode2
} from 'lucide-react';
import { intentRuntime, AgentUiFocus } from '../client/heap/intentRuntime';
import { Intent, ToolActivityRecord } from '../client/heap/intentTypes';
import { getRegisteredToolsSnapshot, subscribeRegisteredTools } from '../webmcp/modelContext';

interface RecoveryDrawerProps {
  capsule: Intent | null;
  isOpen: boolean;
  onClose: () => void;
  onRecovered?: (intentId: string) => void;
  onOpenRepairPanel?: () => void;
  agentFocus?: AgentUiFocus | null;
}

const DYNAMIC_SURFACE_TOOL_NAMES = [
  'inspect_customer_delivery_policy',
  'list_authorized_contacts',
  'create_scoped_access_grant',
  'upload_invoice_to_procurement_portal',
  'revoke_access_grant',
  'resume_intent',
] as const;

type DynamicSurfaceToolName = (typeof DYNAMIC_SURFACE_TOOL_NAMES)[number];

export const RecoveryDrawer: React.FC<RecoveryDrawerProps> = ({
  capsule,
  isOpen,
  onClose,
  onRecovered,
  onOpenRepairPanel,
  agentFocus,
}) => {
  const [activeTab, setActiveTab] = useState<'recovery' | 'policy' | 'evidence' | 'webmcp'>('recovery');
  const [registeredTools, setRegisteredTools] = useState<any[]>([]);
  const [toolLogs, setToolLogs] = useState<ToolActivityRecord[]>([]);
  const [sourcePulse, setSourcePulse] = useState(false);
  const [compatibilityAction, setCompatibilityAction] = useState<'portal' | 'grant' | 'resume' | 'revoke' | null>(null);
  const [compatibilityResult, setCompatibilityResult] = useState<string | null>(null);
  const [compatibilityContactId, setCompatibilityContactId] = useState('');
  const [compatibilityExpirationMinutes, setCompatibilityExpirationMinutes] = useState(60);

  useEffect(() => {
    if (!agentFocus) return;
    if (agentFocus.highlight === 'failure_source') {
      setActiveTab('evidence');
      setSourcePulse(true);
      const timer = setTimeout(() => setSourcePulse(false), 2600);
      return () => clearTimeout(timer);
    }
    if (agentFocus.highlight === 'verification' || agentFocus.highlight === 'alternate_route') {
      setActiveTab('recovery');
    }
  }, [agentFocus?.at]);

  useEffect(() => {
    const updateLogs = () => {
      const logs = intentRuntime.getToolLogs();
      setToolLogs(logs);
      setRegisteredTools(getRegisteredToolsSnapshot());
      if (capsule) {
        const fresh = intentRuntime.getIntent(capsule.id);
        if (fresh?.status === 'completed') {
          onRecovered?.(capsule.id);
        }
      }
    };

    updateLogs();
    const unsubRuntime = intentRuntime.subscribe(updateLogs);
    const unsubTools = subscribeRegisteredTools(updateLogs);
    return () => {
      unsubRuntime();
      unsubTools();
    };
  }, [capsule]);

  if (!isOpen || !capsule) return null;

  const currentIntent = intentRuntime.getIntent(capsule.id) || capsule;
  const repairJob = intentRuntime.getRepairJob();
  const isBlocked = currentIntent.status === 'blocked';
  const isMitigated = currentIntent.status === 'mitigated';
  const isResumable = currentIntent.status === 'resumable';
  const isCompleted = currentIntent.status === 'completed';
  const accessGrant = intentRuntime.getAccessGrant();
  const customerPolicy = intentRuntime.getCustomerPolicy();
  const authorizedContacts = intentRuntime.getAuthorizedContacts();
  const recoveryScenario = intentRuntime.getRecoveryScenario();
  const portalAvailable = intentRuntime.getProcurementPortalAvailability();
  const portalReceipt = intentRuntime.getProcurementPortalReceipt();
  const hasUsableGrant = intentRuntime.hasUsableAccessGrant();
  const issuedAccessUrl = intentRuntime.getLastIssuedAccessUrl();
  const primaryRouteHealthy = intentRuntime.getCurrentBuild() === 'demo-build-b';
  const registeredToolNames = new Set(registeredTools.map((tool) => tool.name));
  const registeredDynamicToolNames = DYNAMIC_SURFACE_TOOL_NAMES.filter((toolName) => registeredToolNames.has(toolName));

  let previousSurfaceLabel = 'Healthy';
  let expectedPreviousDynamicTools: DynamicSurfaceToolName[] = [];
  let expectedCurrentDynamicTools: DynamicSurfaceToolName[] = [];
  if (isBlocked) {
    previousSurfaceLabel = 'Healthy';
    expectedCurrentDynamicTools = [
      'inspect_customer_delivery_policy',
      'list_authorized_contacts',
      'create_scoped_access_grant',
      'upload_invoice_to_procurement_portal',
    ];
  } else if (isMitigated) {
    previousSurfaceLabel = 'Blocked';
    expectedPreviousDynamicTools = [
      'inspect_customer_delivery_policy',
      'list_authorized_contacts',
      'create_scoped_access_grant',
      'upload_invoice_to_procurement_portal',
    ];
    expectedCurrentDynamicTools = [
      'inspect_customer_delivery_policy',
      'list_authorized_contacts',
      ...(hasUsableGrant ? ['revoke_access_grant' as const] : []),
    ];
  } else if (isResumable) {
    previousSurfaceLabel = hasUsableGrant ? 'Mitigated' : 'Blocked';
    expectedPreviousDynamicTools = hasUsableGrant ? ['revoke_access_grant'] : [];
    expectedCurrentDynamicTools = hasUsableGrant
      ? ['revoke_access_grant', 'resume_intent']
      : ['resume_intent'];
  } else if (isCompleted) {
    previousSurfaceLabel = 'Resumable';
    expectedPreviousDynamicTools = hasUsableGrant
      ? ['revoke_access_grant', 'resume_intent']
      : ['resume_intent'];
    expectedCurrentDynamicTools = hasUsableGrant ? ['revoke_access_grant'] : [];
  }

  const currentDynamicToolNames = registeredTools.length > 0
    ? registeredDynamicToolNames
    : expectedCurrentDynamicTools;
  const currentSurfaceLabel = registeredTools.length > 0 ? 'Now' : 'Expected now';
  const addedDynamicTools = currentDynamicToolNames.filter((toolName) => !expectedPreviousDynamicTools.includes(toolName));
  const removedDynamicTools = expectedPreviousDynamicTools.filter((toolName) => !currentDynamicToolNames.includes(toolName));

  const runCompatibilityAction = async (
    action: NonNullable<typeof compatibilityAction>,
    execute: () => Promise<string>,
  ) => {
    setCompatibilityAction(action);
    setCompatibilityResult(null);
    try {
      setCompatibilityResult(await execute());
    } catch (error) {
      setCompatibilityResult(error instanceof Error ? error.message : String(error));
    } finally {
      setCompatibilityAction(null);
    }
  };

  const compatibilityContact = authorizedContacts.find(
    (contact) => contact.id === compatibilityContactId,
  );

  const attemptPortalFromBrowser = () =>
    runCompatibilityAction('portal', async () => {
      if (!compatibilityContact) throw new Error('Select a contact before attempting delivery.');
      await intentRuntime.uploadInvoiceToProcurementPortal(currentIntent.id, compatibilityContact.id);
      return `Portal delivery verified for ${compatibilityContact.name}.`;
    });

  const issueGrantFromBrowser = () =>
    runCompatibilityAction('grant', async () => {
      if (!compatibilityContact) throw new Error('Select a contact before requesting access.');
      await intentRuntime.createScopedAccessGrant(
        currentIntent.id,
        compatibilityContact.id,
        compatibilityExpirationMinutes,
        'read_invoice_only',
        `Approved through the browser compatibility control for ${compatibilityContact.name}.`,
        'user',
      );
      return `Issued ${compatibilityExpirationMinutes}-minute read-only access for ${compatibilityContact.name}.`;
    });

  const resumeFromBrowser = () =>
    runCompatibilityAction('resume', async () => {
      await intentRuntime.resumeIntent(currentIntent.id);
      return 'Repaired email delivery completed using the existing invoice.';
    });

  const revokeFromBrowser = () =>
    runCompatibilityAction('revoke', async () => {
      await intentRuntime.revokeAlternateAccess(
        currentIntent.id,
        'Primary email delivery succeeded after the approved repair.',
      );
      return 'Temporary invoice access was revoked.';
    });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-[3px] transition-opacity animate-fade-in text-slate-100 font-sans">
      <div className="w-full sm:w-[500px] xl:w-[540px] max-w-full h-full bg-[#0d121f] border-l border-slate-800/90 shadow-2xl flex flex-col overflow-hidden animate-slide-in">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-800/90 flex items-center justify-between bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-semibold tracking-tight text-white">RECOVERY</span>
            <span
              className={`px-2.5 py-0.5 text-[11px] font-mono font-semibold rounded-full border ${
                isCompleted
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : isResumable
                  ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20 animate-pulse'
                  : isMitigated
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                  : isBlocked
                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
              }`}
            >
              {isCompleted
                ? '✓ COMPLETED'
                : isResumable
                ? '● RESUMABLE'
                : isMitigated
                ? '◐ MITIGATED'
                : isBlocked
                ? '✕ BLOCKED'
                : '● ACTIVE'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab(activeTab === 'webmcp' ? 'recovery' : 'webmcp')}
              className={`p-1.5 rounded-lg text-xs font-mono transition-all border ${
                activeTab === 'webmcp'
                  ? 'bg-slate-800 text-emerald-400 border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 border-transparent'
              }`}
              title="Toggle WebMCP Developer Details"
            >
              &lt;/&gt; WebMCP ({registeredTools.length})
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800/60 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 4 Tabs Bar (§6) */}
        <div className="flex items-center border-b border-slate-800/80 bg-slate-950/30 px-4 text-xs font-medium shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('recovery')}
            className={`py-2.5 px-3 border-b-2 transition-all shrink-0 ${
              activeTab === 'recovery'
                ? 'border-indigo-500 text-white font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            [ Recovery ]
          </button>
          <button
            onClick={() => setActiveTab('policy')}
            className={`py-2.5 px-3 border-b-2 transition-all shrink-0 flex items-center gap-1.5 ${
              activeTab === 'policy'
                ? 'border-emerald-500 text-emerald-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" /> [ Policy Gate ]
          </button>
          <button
            onClick={() => setActiveTab('evidence')}
            className={`py-2.5 px-3 border-b-2 transition-all shrink-0 flex items-center gap-1.5 ${
              activeTab === 'evidence'
                ? 'border-indigo-500 text-white font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" /> [ Evidence ]
          </button>
          <button
            onClick={() => setActiveTab('webmcp')}
            className={`py-2.5 px-3 border-b-2 transition-all shrink-0 flex items-center gap-1.5 ${
              activeTab === 'webmcp'
                ? 'border-emerald-500 text-emerald-300 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            [ WebMCP ] <span className="font-mono text-[10px] text-emerald-400">({registeredTools.length})</span>
          </button>
        </div>

        {/* Tab 1: Recovery (§6 Formatted Exactly to Spec) */}
        {activeTab === 'recovery' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs font-mono">
            {/* Intent */}
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-indigo-400">Outcome the user needs</span>
              <div className="text-sm font-sans font-bold text-white leading-snug">
                {currentIntent.goal.outcome}
              </div>
              <div className="text-emerald-400 font-bold">${currentIntent.entities.amount?.toLocaleString()} USD</div>
            </div>

            {/* Routes to the outcome */}
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400">Routes to that outcome</span>
              <div className="space-y-1 text-[11px]">
                <div className={`flex items-center gap-1.5 ${primaryRouteHealthy ? 'text-emerald-300' : 'text-rose-300'}`}>
                  <span className={primaryRouteHealthy ? 'text-emerald-400' : 'text-rose-400'}>
                    {primaryRouteHealthy ? '✓' : '✕'}
                  </span>
                  email_delivery · {primaryRouteHealthy ? 'repaired' : 'broken at DeliveryService.ts:42'}
                </div>
                <div className={`flex items-center gap-1.5 ${hasUsableGrant ? 'text-emerald-300' : 'text-slate-400'}`}>
                  <span className={hasUsableGrant ? 'text-emerald-400' : 'text-slate-500'}>
                    {hasUsableGrant ? '✓' : '○'}
                  </span>
                  secure_share_link · {hasUsableGrant ? 'active' : 'available, not used'}
                </div>
                <div className={`flex items-center gap-1.5 ${portalReceipt ? 'text-emerald-300' : 'text-slate-400'}`}>
                  <span className={portalReceipt ? 'text-emerald-400' : 'text-slate-500'}>
                    {portalReceipt ? '✓' : '○'}
                  </span>
                  procurement_portal · {portalReceipt ? 'uploaded and verified' : portalAvailable ? 'available' : 'availability unknown until attempted'}
                </div>
              </div>
              <div className="pt-1 text-[10px] text-slate-400 font-sans">
                A broken route is not a lost goal. The outcome is reachable while the defect stays open.
              </div>
            </div>

            {/* Progress */}
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400">Progress</span>
              <div className="space-y-1 text-[11px]">
                <div className="text-emerald-300 flex items-center gap-1.5">
                  <span className="text-emerald-400">✓</span> Invoice created in database (INV-2841)
                </div>
                <div className="text-rose-300 flex items-center gap-1.5">
                  <span className="text-rose-400">✕</span> Delivery dispatch (HTTP 500)
                </div>
              </div>
            </div>

            {/* Current state */}
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1 text-[11px] text-slate-300">
              <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">Current state</span>
              <div>• Invoice ID: <strong className="text-white">{currentIntent.entities.invoiceId}</strong></div>
              <div>• Amount: <strong className="text-white">${currentIntent.entities.amount}</strong></div>
              <div>• Delivery: <strong className={isCompleted ? 'text-emerald-400' : 'text-rose-400'}>{isCompleted ? 'Sent ✓' : 'Incomplete'}</strong></div>
              <div>• Outcome: <strong className={isCompleted || hasUsableGrant ? 'text-emerald-400' : 'text-rose-400'}>
                {isCompleted
                  ? 'Reached by email ✓'
                  : hasUsableGrant
                  ? 'Reached by share link ✓'
                  : portalReceipt
                  ? 'Reached through procurement portal ✓'
                  : 'Not reached'}
              </strong></div>
            </div>

            {/* Protected Invariants */}
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1 text-[11px]">
              <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">Protected Invariants</span>
              <div className="text-emerald-300 flex items-center gap-1.5">
                <span className="text-emerald-400 font-bold">✓</span> Never duplicate invoice (INV-2841 already exists)
              </div>
              <div className="text-emerald-300 flex items-center gap-1.5">
                <span className="text-emerald-400 font-bold">✓</span> Never modify amount ($4,850 locked)
              </div>
            </div>

            {/* Failure & Source Context */}
            {currentIntent.runtimeContext && (
              <div className="p-3 bg-rose-950/20 rounded-xl border border-rose-500/30 space-y-1 text-[11px]">
                <span className="text-[10px] uppercase font-bold text-rose-400 block font-mono">Failure</span>
                <div className="text-white font-bold">{currentIntent.runtimeContext.request.route} → 500</div>
                <div className="text-slate-300">
                  {currentIntent.runtimeContext.source.symbol} · {currentIntent.runtimeContext.source.file}:{currentIntent.runtimeContext.source.line}
                </div>
                <div className="text-[10px] text-slate-400 pt-0.5">Build: {currentIntent.runtimeContext.build}</div>
              </div>
            )}

            {/* Alternate route capability */}
            {accessGrant && (
              <div
                className={`p-3 rounded-xl border space-y-1.5 text-[11px] ${
                  hasUsableGrant ? 'bg-amber-950/20 border-amber-500/30' : 'bg-slate-950/80 border-slate-800'
                }`}
              >
                <span className="text-[10px] uppercase font-bold text-amber-400 block font-mono">
                  Alternate route · secure share link
                </span>
                <div className="text-slate-300">
                  • Grant: <strong className="text-white">{accessGrant.id}</strong>
                </div>
                <div className="text-slate-300">• Scope: <strong className="text-white">{accessGrant.scope}</strong></div>
                <div className="text-slate-300">• Audience: <strong className="text-white">{accessGrant.audience}</strong></div>
                <div className="text-slate-300">
                  • Issued by:{' '}
                  <strong className="text-white">
                    {accessGrant.issuedVia === 'webmcp_agent' ? 'browser agent (WebMCP)' : 'user'}
                  </strong>
                </div>
                {intentRuntime.getRecoveryApproval() && (
                  <div className="text-slate-300">
                    • Confirmation:{' '}
                    <strong className="text-emerald-300">
                      {intentRuntime.getRecoveryApproval()?.channel === 'webmcp_agent_conversation'
                        ? 'user-confirmed in agent conversation'
                        : 'confirmed through browser control'}
                    </strong>
                  </div>
                )}
                <div className="text-slate-300">
                  • Recipient viewed:{' '}
                  <strong className={accessGrant.firstAccessedAt ? 'text-amber-300' : 'text-slate-400'}>
                    {accessGrant.firstAccessedAt ? new Date(accessGrant.firstAccessedAt).toLocaleTimeString() : 'not yet'}
                  </strong>
                </div>
                <div className="text-slate-300">
                  • State:{' '}
                  <strong className={hasUsableGrant ? 'text-emerald-400' : 'text-slate-400'}>
                    {accessGrant.revokedAt ? `revoked — ${accessGrant.revokedReason}` : `expires ${new Date(accessGrant.expiresAt).toLocaleTimeString()}`}
                  </strong>
                </div>
                {hasUsableGrant && issuedAccessUrl && (
                  <a
                    href={issuedAccessUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-amber-950/40 hover:bg-amber-900/40 text-amber-200 rounded-lg font-mono text-[11px] border border-amber-500/30 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open the recipient's view
                  </a>
                )}
                <p className="pt-0.5 text-[10px] text-slate-400 font-sans">
                  Only the digest of this link is stored. It reads one invoice, expires, and is revocable.
                </p>
              </div>
            )}

            {portalReceipt && (
              <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 space-y-1.5 text-[11px]">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block font-mono">
                  Procurement portal receipt
                </span>
                <div className="text-slate-300">• Receipt: <strong className="text-white">{portalReceipt.id}</strong></div>
                <div className="text-slate-300">• Account: <strong className="text-white">{portalReceipt.portalAccount}</strong></div>
                <div className="text-slate-300">• Verified: <strong className="text-emerald-300">{new Date(portalReceipt.verifiedAt).toLocaleTimeString()}</strong></div>
              </div>
            )}

            {/* Status */}
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1 text-[11px]">
              <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">Status</span>
              <div className={
                isCompleted
                  ? 'text-emerald-400 font-bold'
                  : isResumable
                  ? 'text-indigo-300 font-bold'
                  : isMitigated
                  ? 'text-amber-300 font-bold'
                  : isBlocked
                  ? 'text-rose-300 font-bold'
                  : 'text-amber-300'
              }>
                {isCompleted
                  ? 'Completed ✓ (Original goal verified)'
                  : isResumable
                  ? 'Resumable (validated candidate live • resume_intent available)'
                  : isMitigated
                  ? 'Mitigated · outcome reached by share link, email route still defective'
                  : repairJob
                  ? `Blocked · repair pipeline ${repairJob.status.replaceAll('_', ' ')}`
                  : 'Blocked by application defect'}
              </div>
            </div>

            <div className="p-3.5 bg-cyan-950/20 rounded-xl border border-cyan-500/30 space-y-2.5">
              <div>
                <span className="text-[10px] uppercase font-bold text-cyan-300 block font-mono">
                  Browser-agent compatibility actions
                </span>
                <p className="mt-1 text-[10px] text-slate-400 font-sans leading-relaxed">
                  Use these visible controls only when the agent host can discover WebMCP tools but cannot invoke them. They call the same server-verified transitions; they are not WebMCP invocations.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {isBlocked && (
                  <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-950/70 p-2.5">
                    <label className="block space-y-1 text-[10px] text-slate-400 font-sans">
                      <span>Contact proposed by agent</span>
                      <select
                        aria-label="Contact proposed by agent"
                        value={compatibilityContactId}
                        onChange={(event) => setCompatibilityContactId(event.target.value)}
                        disabled={compatibilityAction !== null}
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-cyan-500"
                      >
                        <option value="">Select a customer contact</option>
                        {authorizedContacts.map((contact) => (
                          <option key={contact.id} value={contact.id}>
                            {contact.name} · {contact.role.replaceAll('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      onClick={() => void attemptPortalFromBrowser()}
                      disabled={compatibilityAction !== null || !compatibilityContactId}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-3 py-2 text-[11px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-900/40 disabled:opacity-50"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {compatibilityAction === 'portal' ? 'Attempting portal…' : 'Attempt procurement portal'}
                    </button>

                    {!hasUsableGrant && (
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <label className="block space-y-1 text-[10px] text-slate-400 font-sans">
                          <span>Requested expiration</span>
                          <input
                            aria-label="Requested expiration in minutes"
                            type="number"
                            min={1}
                            step={1}
                            value={compatibilityExpirationMinutes}
                            onChange={(event) => setCompatibilityExpirationMinutes(Number(event.target.value))}
                            disabled={compatibilityAction !== null}
                            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-amber-500"
                          />
                        </label>
                        <div className="self-end rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-[10px] text-slate-300">
                          read_invoice_only
                        </div>
                      </div>
                    )}

                    {!hasUsableGrant && (
                      <button
                        onClick={() => void issueGrantFromBrowser()}
                        disabled={compatibilityAction !== null || !compatibilityContactId}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-[11px] font-semibold text-amber-100 transition-colors hover:bg-amber-900/40 disabled:opacity-50"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        {compatibilityAction === 'grant' ? 'Verifying proposal…' : 'Request scoped access grant'}
                      </button>
                    )}
                  </div>
                )}
                {isResumable && (
                  <button
                    onClick={() => void resumeFromBrowser()}
                    disabled={compatibilityAction !== null}
                    className="flex items-center justify-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-950/30 px-3 py-2 text-[11px] font-semibold text-indigo-100 transition-colors hover:bg-indigo-900/40 disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5" />
                    {compatibilityAction === 'resume' ? 'Resuming delivery…' : 'Resume repaired email delivery'}
                  </button>
                )}
                {hasUsableGrant && (
                  <button
                    onClick={() => void revokeFromBrowser()}
                    disabled={compatibilityAction !== null}
                    className="flex items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-[11px] font-semibold text-rose-100 transition-colors hover:bg-rose-900/30 disabled:opacity-50"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    {compatibilityAction === 'revoke' ? 'Revoking access…' : 'Revoke temporary access'}
                  </button>
                )}
              </div>

              {compatibilityResult && (
                <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[10px] text-slate-200 font-mono">
                  {compatibilityResult}
                </div>
              )}
            </div>

            {/* Real Agent Prompting Area (§9) */}
            <div className="pt-2 space-y-2.5">
              {!isCompleted && (
                <div className="p-4 bg-slate-950 rounded-xl border border-indigo-500/30 text-center space-y-2.5">
                  <div className="text-xs text-slate-300 flex items-center justify-center gap-1.5 font-sans font-medium">
                    <Bot className="w-4 h-4 text-indigo-400" />
                    <span>Ask the browser agent:</span>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 font-mono text-indigo-300 text-xs select-all">
                    {isResumable
                      ? '"Can you finish it now?"'
                      : isMitigated
                      ? '"Verify the outcome and keep monitoring the primary route."'
                      : hasUsableGrant
                      ? '"What happened to what I was doing?"'
                      : '"Get Acme the invoice before their review. Don\'t give anyone permanent access, and don\'t make me babysit it."'}
                  </div>

                  {(isBlocked || isMitigated) && (
                    <button
                      onClick={onOpenRepairPanel}
                      className="w-full py-2 px-3 bg-indigo-950/40 hover:bg-indigo-900/50 text-indigo-300 rounded-lg font-mono text-[11px] transition-all border border-indigo-500/30 flex items-center justify-center gap-1.5"
                    >
                      <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                      Open Engineering Review
                    </button>
                  )}
                </div>
              )}

              {isCompleted && (
                <div className="p-4 bg-emerald-950/20 border border-emerald-500/40 rounded-xl text-center space-y-1.5 animate-fade-in">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-xs font-bold">
                    ✓
                  </div>
                  <h4 className="text-sm font-bold text-white font-sans">Workflow Resumed & Completed</h4>
                  <p className="text-xs text-slate-300 font-sans">
                    Executed delivery step only. Invariant preserved (0 duplicate invoices created).
                  </p>
                  {hasUsableGrant && (
                    <div className="pt-2 space-y-1.5">
                      <p className="text-[11px] text-amber-300 font-sans">
                        The workaround share link is still live. Ask the agent to clean up after itself:
                      </p>
                      <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 font-mono text-indigo-300 text-[11px] select-all">
                        "The email went out — revoke that link."
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Policy Gate (§6) */}
        {activeTab === 'policy' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs font-mono">
            <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/30 rounded-xl space-y-1 text-emerald-300">
              <span className="font-bold flex items-center gap-1.5 text-xs">
                <ShieldCheck className="w-4 h-4" /> Authoritative Policy Gate Active
              </span>
              <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                The agent proposes a workflow from policy evidence and primitive capabilities. The server independently verifies every action, parameter, and state transition.
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-slate-400">
                Judge-controlled policy scenario
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => void intentRuntime.setRecoveryScenario('portal_outage')}
                  disabled={hasUsableGrant || Boolean(portalReceipt)}
                  className={`p-2.5 rounded-lg border text-left transition-colors disabled:opacity-40 ${
                    recoveryScenario === 'portal_outage'
                      ? 'border-emerald-500/50 bg-emerald-950/30 text-emerald-200'
                      : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <strong className="block text-[11px]">Portal outage</strong>
                  <span className="text-[9px] text-slate-400">Temporary link fallback permitted</span>
                </button>
                <button
                  onClick={() => void intentRuntime.setRecoveryScenario('portal_only')}
                  disabled={hasUsableGrant || Boolean(portalReceipt)}
                  className={`p-2.5 rounded-lg border text-left transition-colors disabled:opacity-40 ${
                    recoveryScenario === 'portal_only'
                      ? 'border-emerald-500/50 bg-emerald-950/30 text-emerald-200'
                      : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <strong className="block text-[11px]">Portal only</strong>
                  <span className="text-[9px] text-slate-400">External links prohibited</span>
                </button>
              </div>
            </div>

            {customerPolicy && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Customer policy evidence</span>
                  <span className="text-[9px] text-slate-500">{customerPolicy.version}</span>
                </div>
                <blockquote className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-[11px] leading-relaxed text-slate-200 font-sans">
                  {customerPolicy.sourceText}
                </blockquote>
              </div>
            )}

            <div className="space-y-2">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Candidate contacts</span>
              {authorizedContacts.map((contact) => (
                <div key={contact.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[10px] text-slate-300">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-white text-[11px]">{contact.name}</strong>
                    <span className="text-slate-500">{contact.role.replaceAll('_', ' ')}</span>
                  </div>
                  <div className="text-slate-400">{contact.email}</div>
                  <p className="mt-1 text-slate-500 font-sans">{contact.notes}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-slate-400">
                Active Verification Gates
              </span>
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2 font-mono text-[11px]">
                <div className="flex items-center justify-between text-slate-300">
                  <span>• Tenant / Workspace: <strong className="text-white">acme_finance</strong></span>
                  <span className="text-emerald-400 font-bold text-[10px]">Verified ✓</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>• User Identity: <strong className="text-white">user_demo</strong></span>
                  <span className="text-emerald-400 font-bold text-[10px]">Authorized ✓</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>• Resource Ownership: <strong className="text-white">INV-2841</strong></span>
                  <span className="text-emerald-400 font-bold text-[10px]">Owned ✓</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>• Invariant: <strong className="text-white">NEVER_DUPLICATE_INVOICE</strong></span>
                  <span className="text-emerald-400 font-bold text-[10px]">Guarded 🔒</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>• Invariant: <strong className="text-white">NEVER_MODIFY_AMOUNT</strong></span>
                  <span className="text-emerald-400 font-bold text-[10px]">Guarded 🔒</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Evidence & Source Context (§4 & §6) */}
        {activeTab === 'evidence' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs font-mono">
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Runtime Request Context</span>
              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1 text-slate-300 text-[11px]">
                <div>• Request ID: <strong className="text-indigo-400">{currentIntent.runtimeContext?.request.id || 'req_7192'}</strong></div>
                <div>• Route: <strong className="text-white">{currentIntent.runtimeContext?.request.route || 'POST /api/invoices/INV-2841/send'}</strong></div>
                <div>• HTTP Status: <strong className="text-rose-400">{currentIntent.runtimeContext?.request.httpStatus || 500}</strong></div>
                <div>• Build ID: <strong className="text-amber-300">{currentIntent.runtimeContext?.build || 'demo-build-a'}</strong></div>
              </div>
            </div>

            {/* Resolved Source Code Snippet (§4) */}
            {currentIntent.runtimeContext?.source && (
              <div
                className={`space-y-1.5 rounded-xl transition-all ${
                  sourcePulse ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-[#0d121f] animate-pulse' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                    Source Code Context ({currentIntent.runtimeContext.source.file}:{currentIntent.runtimeContext.source.line})
                  </span>
                  {sourcePulse ? (
                    <span className="text-[10px] text-indigo-300 font-mono">● agent is reading this</span>
                  ) : (
                    <span className="text-[10px] text-indigo-400">{currentIntent.runtimeContext.source.linesRange}</span>
                  )}
                </div>
                <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[10px] text-emerald-300 overflow-x-auto leading-relaxed">
                  {currentIntent.runtimeContext.source.snippet}
                </pre>
              </div>
            )}

            <div className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Intent History Log</span>
              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5 text-[10px] text-slate-400">
                {currentIntent.history.map((h, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-slate-600 shrink-0">{h.timestamp}</span>
                    <span className="text-slate-300">{h.note}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: WebMCP Inspector (§7 & §8) */}
        {activeTab === 'webmcp' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs font-mono">
            {/* Dynamic Breathing Surface Banner (§7) */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1 text-[11px]">
              <span className="text-emerald-400 font-bold block">WebMCP Dynamic Tool Surface:</span>
              <p className="text-slate-300 text-[10px] font-sans">
                The tool list is a function of server-authoritative state, not a fixed manifest. The
                tool surface is state-gated: actions invalid for the current lifecycle state do not
                exist in the schema. The server still enforces every call and parameter.
              </p>
              <div className="pt-1 space-y-0.5 text-[10px] font-mono text-slate-400">
                <div>
                  inspect policy + contacts — <span className={isBlocked || isMitigated ? 'text-emerald-400' : 'text-slate-500'}>{isBlocked || isMitigated ? 'registered' : 'absent'}</span>
                </div>
                <div>
                  create_scoped_access_grant — <span className={isBlocked && !hasUsableGrant ? 'text-emerald-400' : 'text-slate-500'}>{isBlocked && !hasUsableGrant ? 'registered' : 'absent'}</span>
                </div>
                <div>
                  upload_invoice_to_procurement_portal — <span className={isBlocked ? 'text-emerald-400' : 'text-slate-500'}>{isBlocked ? 'registered' : 'absent'}</span>
                </div>
                <div>
                  revoke_access_grant —{' '}
                  <span className={hasUsableGrant ? 'text-emerald-400' : 'text-slate-500'}>
                    {hasUsableGrant ? 'registered' : 'absent'}
                  </span>
                </div>
                <div>
                  resume_intent —{' '}
                  <span className={isResumable ? 'text-emerald-400' : 'text-slate-500'}>
                    {isResumable ? 'registered' : 'absent until deployment evidence passes'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-emerald-500/30 space-y-2.5 text-[10px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-emerald-300 font-bold uppercase tracking-wider">Capability transition</span>
                <span className="text-slate-500 font-mono">{currentIntent.status}</span>
              </div>
              <p className="text-slate-400 font-sans leading-relaxed">
                Watch the state change the agent's available actions. Base tools stay registered; only the dynamic surface is compared here.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[{
                  label: `Before · ${previousSurfaceLabel}`,
                  toolNames: expectedPreviousDynamicTools,
                  tone: 'border-slate-800 bg-slate-900/60',
                  nameTone: 'text-slate-400',
                }, {
                  label: `Current · ${currentSurfaceLabel}`,
                  toolNames: currentDynamicToolNames,
                  tone: 'border-emerald-500/30 bg-emerald-950/20',
                  nameTone: 'text-emerald-300',
                }].map((surface) => (
                  <div key={surface.label} className={`rounded-lg border p-2 space-y-1.5 ${surface.tone}`}>
                    <div className="text-[9px] uppercase tracking-wider text-slate-500">{surface.label}</div>
                    {DYNAMIC_SURFACE_TOOL_NAMES.map((toolName) => {
                      const isRegistered = surface.toolNames.includes(toolName);
                      return (
                        <div key={toolName} className="flex items-start gap-1.5 leading-tight">
                          <span className={isRegistered ? 'text-emerald-400' : 'text-slate-700'}>{isRegistered ? '●' : '○'}</span>
                          <span className={isRegistered ? surface.nameTone : 'text-slate-600'}>{toolName}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              {(addedDynamicTools.length > 0 || removedDynamicTools.length > 0) && (
                <div className="text-[10px] font-sans text-slate-400">
                  {addedDynamicTools.length > 0 && (
                    <span>Appeared: <strong className="text-emerald-300">{addedDynamicTools.join(', ')}</strong>. </span>
                  )}
                  {removedDynamicTools.length > 0 && (
                    <span>Withdrawn: <strong className="text-amber-300">{removedDynamicTools.join(', ')}</strong>.</span>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                Active WebMCP Capabilities ({registeredTools.length})
              </span>
              <div className="space-y-1.5">
                {registeredTools.map((t) => {
                  const isDynamic = DYNAMIC_SURFACE_TOOL_NAMES.includes(t.name as DynamicSurfaceToolName);
                  return (
                    <div
                      key={t.name}
                      className={`p-2 rounded-xl border text-[11px] ${
                        isDynamic ? 'bg-indigo-950/30 border-indigo-500/40 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-400">{t.name}()</span>
                        <span className="text-[10px] text-slate-500">{isDynamic ? '⚡ Dynamic' : 'Base'}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">{t.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="h-px bg-slate-800/80" />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                  Real-Time Tool Invocation Audit ({toolLogs.length})
                </span>
                {toolLogs.length > 0 && (
                  <span className="text-[10px] text-emerald-400">Active Live Stream</span>
                )}
              </div>

              {toolLogs.length === 0 ? (
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center space-y-1">
                  <p className="text-slate-400 text-[11px]">No WebMCP tools invoked yet.</p>
                  <p className="text-slate-500 text-[10px]">
                    Waiting for external agent calls via document.modelContext...
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {toolLogs.map((log, idx) => (
                    <div key={idx} className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-[11px] space-y-1">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-emerald-400 font-bold">{log.toolName}()</span>
                        <span className="text-[10px] text-slate-500">{log.timestamp} · {log.latencyMs}ms</span>
                      </div>
                      <pre className="text-slate-300 text-[10px] overflow-x-auto">
                        {JSON.stringify(log.parameters, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
