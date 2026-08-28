import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  CreditCard,
  UserPlus,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Download,
  ShieldAlert,
  ArrowRight,
  Clock,
  Sparkles,
  Layers,
  ChevronRight
} from 'lucide-react';
import { intentRuntime, IntentCapsule } from '../recovery/intentRuntime';

interface PulseMetricsAppProps {
  onSelectCapsule?: (capsuleId: string) => void;
}

export const PulseMetricsApp: React.FC<PulseMetricsAppProps> = ({ onSelectCapsule }) => {
  // Workflow 1: Invoice
  const [invoiceStatus, setInvoiceStatus] = useState<'idle' | 'created_undelivered' | 'sent'>('idle');
  // Workflow 2: Export
  const [exportStatus, setExportStatus] = useState<'idle' | 'aggregated_failed' | 'downloaded'>('idle');
  // Workflow 3: Teammate Invite
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'seat_allocated_failed' | 'invited'>('idle');

  const [activeCapsules, setActiveCapsules] = useState<IntentCapsule[]>([]);

  useEffect(() => {
    setActiveCapsules(intentRuntime.getActiveCapsules());
    const unsub = intentRuntime.subscribe(() => {
      setActiveCapsules(intentRuntime.getActiveCapsules());
    });
    return () => unsub();
  }, []);

  // TRIGGER WORKFLOW 1: Create & Send Invoice
  const handleTriggerInvoice = () => {
    if (invoiceStatus === 'sent') return;

    setInvoiceStatus('created_undelivered');

    intentRuntime.registerInterruptedIntent(
      {
        id: 'in_9172',
        title: 'Send Invoice #INV-8272 to Acme Corp ($4,850)',
        goal: 'Create and deliver invoice #INV-8272 to Acme Corp for $4,850.00',
        progressSummary: {
          completedSteps: ['Customer Acme Corp selected', 'Invoice #INV-8272 created in database', '3 line items saved'],
          failedStep: 'Email notification dispatch',
          failureReason: 'Customer billing contact "billing@acme.com" has emailVerification=pending',
        },
        currentState: {
          invoiceId: 'INV-8272',
          amount: 4850.0,
          recipient: 'billing@acme.com',
          invoiceExists: true,
          emailDelivered: false,
        },
        invariants: [
          'NEVER create a duplicate invoice (INV-8272 already exists)',
          'NEVER double-charge credit card',
          'Preserve all 3 line items',
        ],
        status: 'interrupted',
        allowedRecoveryActions: [
          {
            actionId: 'verify_customer_email',
            name: 'Verify Customer Email Address',
            description: 'Sets billing@acme.com verification status to confirmed in billing directory.',
            risk: 'safe_retry',
          },
          {
            actionId: 'retry_invoice_delivery',
            name: 'Retry Invoice Email Delivery',
            description: 'Re-attempts email dispatch for existing invoice #INV-8272 without re-creating invoice.',
            risk: 'safe_retry',
          },
        ],
        verificationAssertion: 'invoice.status === "sent" && emailDelivered === true',
        history: [{ timestamp: new Date().toLocaleTimeString(), note: 'Workflow interrupted during email dispatch.' }],
      },
      {
        verify_customer_email: async () => {
          return { success: true, verifiedEmail: 'billing@acme.com', status: 'confirmed' };
        },
        retry_invoice_delivery: async () => {
          setInvoiceStatus('sent');
          intentRuntime.completeIntent('in_9172');
          return { success: true, invoiceId: 'INV-8272', status: 'sent', emailSent: true };
        },
      }
    );
  };

  // TRIGGER WORKFLOW 2: Export CSV Report
  const handleTriggerExport = () => {
    if (exportStatus === 'downloaded') return;

    setExportStatus('aggregated_failed');

    intentRuntime.registerInterruptedIntent(
      {
        id: 'in_3841',
        title: 'Export Q3 Revenue Cohort Report (.csv)',
        goal: 'Generate and download CSV artifact for Q3 2026 revenue cohort analysis',
        progressSummary: {
          completedSteps: ['Executed 30s cohort query', 'Calculated 24 monthly aggregate rows', 'Formatted data matrix'],
          failedStep: 'Browser download streaming',
          failureReason: 'exportMode="legacy_chunk" in session state cannot stream binary CSV chunks',
        },
        currentState: {
          reportId: 'q3-revenue-2026',
          rowsCalculated: 24,
          aggregatesCached: true,
          exportMode: 'legacy_chunk',
          downloadStreamOpen: false,
        },
        invariants: [
          'PRESERVE calculated SQL aggregates (do not re-run expensive 30s cohort query)',
          'Ensure all 24 rows are preserved',
        ],
        status: 'interrupted',
        allowedRecoveryActions: [
          {
            actionId: 'switch_to_streaming_v2',
            name: 'Switch Session to Standard Streaming v2',
            description: 'Upgrades session state from legacy_chunk to streaming_v2 without re-calculating report data.',
            risk: 'state_adjustment',
          },
          {
            actionId: 'retry_export_download',
            name: 'Retry Binary CSV Download Stream',
            description: 'Initiates direct client-side CSV download using cached 24 aggregated rows.',
            risk: 'safe_retry',
          },
        ],
        verificationAssertion: 'CSV artifact generated with 24 rows and downloaded to client.',
        history: [{ timestamp: new Date().toLocaleTimeString(), note: 'Workflow interrupted during CSV streaming.' }],
      },
      {
        switch_to_streaming_v2: async () => {
          return { success: true, exportMode: 'streaming_v2' };
        },
        retry_export_download: async () => {
          setExportStatus('downloaded');
          intentRuntime.completeIntent('in_3841');

          // Trigger real client CSV download
          const blob = new Blob(['Quarter,Month,MRR,Net_ARR\nQ3-2026,July,$138k,$1.65M\nQ3-2026,August,$140k,$1.68M\nQ3-2026,September,$142.5k,$1.71M'], {
            type: 'text/csv',
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'q3_revenue_cohort_report.csv';
          a.click();

          return { success: true, filename: 'q3_revenue_cohort_report.csv', rowsDownloaded: 24 };
        },
      }
    );
  };

  // TRIGGER WORKFLOW 3: Teammate Invite
  const handleTriggerInvite = () => {
    if (inviteStatus === 'invited') return;

    setInviteStatus('seat_allocated_failed');

    intentRuntime.registerInterruptedIntent(
      {
        id: 'in_5629',
        title: 'Provision Seat & Invite Sarah Chen (Admin)',
        goal: 'Allocate Enterprise license seat and dispatch invitation to sarah@acme.com',
        progressSummary: {
          completedSteps: ['License seat allocated in billing', 'Admin permissions assigned'],
          failedStep: 'Security invite token dispatch',
          failureReason: 'Rate limit cooldown encountered on auth mailer gateway',
        },
        currentState: {
          recipientEmail: 'sarah@acme.com',
          role: 'Admin',
          seatAllocated: true,
          seatId: 'seat_9921_enterprise',
          inviteDispatched: false,
        },
        invariants: [
          'DO NOT double-allocate license seat (seat_9921 is already reserved in billing)',
          'Preserve Admin role assignment',
        ],
        status: 'interrupted',
        allowedRecoveryActions: [
          {
            actionId: 'refresh_invite_token',
            name: 'Refresh Invite Security Token',
            description: 'Generates a fresh single-use invite token bypassing stale rate limit slot.',
            risk: 'safe_retry',
          },
          {
            actionId: 'dispatch_team_invitation',
            name: 'Dispatch Team Invitation',
            description: 'Sends invitation email using reserved seat_9921.',
            risk: 'safe_retry',
          },
        ],
        verificationAssertion: 'invite.status === "dispatched" && seatAllocated === true',
        history: [{ timestamp: new Date().toLocaleTimeString(), note: 'Workflow interrupted during invite token dispatch.' }],
      },
      {
        refresh_invite_token: async () => {
          return { success: true, tokenRefreshed: true };
        },
        dispatch_team_invitation: async () => {
          setInviteStatus('invited');
          intentRuntime.completeIntent('in_5629');
          return { success: true, recipient: 'sarah@acme.com', status: 'dispatched' };
        },
      }
    );
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in text-slate-100">
      {/* App Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight">PulseMetrics SaaS Platform</h1>
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md">
                  WebMCP Recovery Enabled
                </span>
              </div>
              <p className="text-xs text-slate-400">
                A living web application that exposes recovery surfaces when human workflows stall.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Workflow Triggers */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 self-start md:self-center flex-wrap text-xs">
          <span className="text-[10px] text-slate-500 font-mono uppercase px-2 font-semibold">Start Action:</span>
          <button
            onClick={handleTriggerInvoice}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all"
          >
            1. Invoice ($4.8k)
          </button>
          <button
            onClick={handleTriggerExport}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all"
          >
            2. Export CSV
          </button>
          <button
            onClick={handleTriggerInvite}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all"
          >
            3. Invite Teammate
          </button>
        </div>
      </div>

      {/* WORKFLOW 1 CARD: Invoicing */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 relative overflow-hidden shadow-lg">
        {invoiceStatus === 'created_undelivered' && (
          <div
            onClick={() => onSelectCapsule?.('in_9172')}
            className="absolute top-4 right-4 cursor-pointer bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 animate-pulse shadow-md"
          >
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Interrupted Intent: <strong>in_9172</strong></span>
          </div>
        )}

        <div className="pb-4 border-b border-slate-800">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-400" /> Client Invoicing & Payment Release
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Send custom invoices and trigger automated payment delivery.</p>
        </div>

        <div className="mt-4 p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-white text-sm">Acme Corp — Invoice #INV-8272</span>
              <span className="text-xs px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-medium">
                $4,850.00
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">Recipient: billing@acme.com • 3 Professional Services Line Items</p>
          </div>

          {invoiceStatus === 'sent' ? (
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <CheckCircle2 className="w-4 h-4" /> Invoice Created & Delivered Successfully ✓
            </div>
          ) : (
            <button
              onClick={handleTriggerInvoice}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-md shadow-emerald-950/40 shrink-0"
            >
              Create & Send Invoice ($4,850)
            </button>
          )}
        </div>

        {/* Interruption State Alert */}
        {invoiceStatus === 'created_undelivered' && (
          <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
            <div className="flex items-start gap-2.5 text-amber-300 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Workflow Interrupted: Email Dispatch Failed</p>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                  Invoice #INV-8272 exists in database, but email delivery failed (unverified email address). 
                  <strong> Recovery Capsule in_9172 created.</strong> WebMCP recovery tools are now live for the agent.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* WORKFLOW 2 CARD: Analytics Export */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 relative overflow-hidden shadow-lg">
        {exportStatus === 'aggregated_failed' && (
          <div
            onClick={() => onSelectCapsule?.('in_3841')}
            className="absolute top-4 right-4 cursor-pointer bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 animate-pulse shadow-md"
          >
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Interrupted Intent: <strong>in_3841</strong></span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-400" /> Q3 Revenue Cohort Analysis
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Heavy 30-second multi-dimensional SQL cohort calculation.</p>
          </div>

          <button
            onClick={handleTriggerExport}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-2 shadow-lg shadow-indigo-950/40 shrink-0 self-start sm:self-center"
          >
            <Download className="w-4 h-4" />
            {exportStatus === 'downloaded' ? 'Export Downloaded Successfully ✓' : 'Export Quarterly Report (.csv)'}
          </button>
        </div>

        {exportStatus === 'aggregated_failed' && (
          <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
            <div className="flex items-start gap-2.5 text-amber-300 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Workflow Interrupted: CSV Streaming Stall</p>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                  24 cohort rows successfully computed. Download stream stalled due to legacy session format. 
                  <strong> Invariant active: Do not re-run 30s calculation.</strong>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* WORKFLOW 3 CARD: Team Provisioning */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 relative overflow-hidden shadow-lg">
        {inviteStatus === 'seat_allocated_failed' && (
          <div
            onClick={() => onSelectCapsule?.('in_5629')}
            className="absolute top-4 right-4 cursor-pointer bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 animate-pulse shadow-md"
          >
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Interrupted Intent: <strong>in_5629</strong></span>
          </div>
        )}

        <div className="pb-4 border-b border-slate-800">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-400" /> Team Seat Allocation & Access Provisioning
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Provision enterprise seats and dispatch security access invitations.</p>
        </div>

        <div className="mt-4 p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-white text-sm">Sarah Chen — Enterprise Admin</span>
              <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded font-medium">
                Admin Role
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">Recipient: sarah@acme.com • Enterprise License Seat Tier</p>
          </div>

          {inviteStatus === 'invited' ? (
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <CheckCircle2 className="w-4 h-4" /> Invitation Dispatched ✓
            </div>
          ) : (
            <button
              onClick={handleTriggerInvite}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-md shadow-blue-950/40 shrink-0"
            >
              Allocate Seat & Send Invite
            </button>
          )}
        </div>

        {inviteStatus === 'seat_allocated_failed' && (
          <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
            <div className="flex items-start gap-2.5 text-amber-300 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Workflow Interrupted: Security Token Cooldown</p>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                  Seat allocated in billing, but token generation encountered cooldown. 
                  <strong> Invariant active: DO NOT double-allocate seat.</strong>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
