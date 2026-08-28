import React, { useState } from 'react';
import {
  Clock,
  Code,
  Shield,
  Layers,
  X,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Lock,
  Sparkles,
  ArrowRight,
  TrendingUp
} from 'lucide-react';
import { IntentCapsule } from '../recovery/intentRuntime';
import { ensureModelContext } from '../webmcp/modelContext';

interface RecoveryInspectorModalProps {
  capsule: IntentCapsule | null;
  isOpen: boolean;
  onClose: () => void;
}

export const RecoveryInspectorModal: React.FC<RecoveryInspectorModalProps> = ({
  capsule,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'capsule' | 'surface' | 'flywheel'>('capsule');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const tools = ensureModelContext().getToolsSync();

  const handleCopyJson = () => {
    if (capsule) {
      navigator.clipboard.writeText(JSON.stringify(capsule, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in text-slate-100">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('capsule')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'capsule' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" /> Recovery Capsule {capsule ? `(${capsule.id})` : ''}
            </button>
            <button
              onClick={() => setActiveTab('surface')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'surface' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code className="w-3.5 h-3.5" /> Dynamic WebMCP Surface ({tools.length})
            </button>
            <button
              onClick={() => setActiveTab('flywheel')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'flywheel' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" /> Living Website Flywheel
            </button>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab 1: Recovery Capsule I = (G, S, A, V) */}
        {activeTab === 'capsule' && (
          <div className="space-y-4 overflow-y-auto flex-1 pr-1 text-xs">
            {capsule ? (
              <>
                <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div>
                    <span className="font-mono text-indigo-400 font-bold text-sm">{capsule.id}</span>
                    <h3 className="font-semibold text-white mt-0.5">{capsule.title}</h3>
                  </div>
                  <button
                    onClick={handleCopyJson}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-mono flex items-center gap-1 border border-slate-700"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied Capsule' : 'Copy JSON'}</span>
                  </button>
                </div>

                {/* G: Goal */}
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block font-mono">
                    G — Desired Human Goal
                  </span>
                  <p className="text-white font-medium text-xs">{capsule.goal}</p>
                </div>

                {/* S: State & Progress */}
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block font-mono">
                    S — Current Progress & State
                  </span>
                  <div className="space-y-1 text-[11px]">
                    {(capsule.progressSummary?.completedSteps || capsule.workflow?.completedSteps || []).map((s, idx) => (
                      <div key={idx} className="text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> {s}
                      </div>
                    ))}
                    <div className="text-rose-300 flex items-center gap-1.5 pt-1">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span>
                        <strong>Incomplete:</strong> {capsule.progressSummary?.failedStep || capsule.workflow?.failedStep || 'Pending'} ({capsule.progressSummary?.failureReason || capsule.workflow?.gap || 'Action required'})
                      </span>
                    </div>
                  </div>

                  <pre className="p-2 bg-slate-900 rounded border border-slate-800 text-[10px] font-mono text-slate-300 overflow-x-auto mt-2">
                    {JSON.stringify(capsule.currentState, null, 2)}
                  </pre>
                </div>

                {/* Invariants */}
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block font-mono">
                    Guarded Invariants (Must Never Violate)
                  </span>
                  {capsule.invariants.map((inv, idx) => (
                    <div key={idx} className="text-slate-300 text-[11px] flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" /> {inv}
                    </div>
                  ))}
                </div>

                {/* A: Actions */}
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block font-mono">
                    A — Permitted Semantic WebMCP Recovery Actions
                  </span>
                  {capsule.allowedRecoveryActions.map((a) => (
                    <div key={a.actionId} className="p-2 bg-slate-900 rounded-lg border border-slate-800 text-[11px] space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white font-mono">{a.actionId}()</span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded">
                          {a.riskClass || a.risk || 'SAFE_MUTATION'}
                        </span>
                      </div>
                      <p className="text-slate-300">{a.description}</p>
                    </div>
                  ))}
                </div>

                {/* V: Verification */}
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block font-mono">
                    V — Success Verification Assertion
                  </span>
                  <pre className="p-2 bg-slate-900 rounded border border-slate-800 text-[11px] font-mono text-purple-300">
                    {capsule.verificationAssertion}
                  </pre>
                </div>
              </>
            ) : (
              <p className="text-slate-400 text-center py-8">No active Recovery Capsule selected.</p>
            )}
          </div>
        )}

        {/* Tab 2: Dynamic WebMCP Surface */}
        {activeTab === 'surface' && (
          <div className="space-y-3 overflow-y-auto flex-1 pr-1 text-xs">
            <p className="text-slate-400 text-xs">
              Tools currently exposed on <code className="text-emerald-400 font-mono">document.modelContext</code>. Dynamic recovery tools appear during an interruption and clean up automatically once the goal is verified:
            </p>
            <div className="space-y-2">
              {tools.map((t) => {
                const isDynamic = t.description.includes('[Dynamic Recovery Action]');

                return (
                  <div
                    key={t.name}
                    className={`p-3 rounded-xl border space-y-2 ${
                      isDynamic
                        ? 'bg-amber-950/20 border-amber-500/40 shadow-sm'
                        : 'bg-slate-950 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-emerald-400 text-xs">{t.name}()</span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                          isDynamic ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {isDynamic ? '⚡ Dynamic Recovery Surface' : 'Base Tool'}
                      </span>
                    </div>
                    <p className="text-slate-300 text-xs">{t.description}</p>
                    <pre className="p-2 bg-slate-900 rounded border border-slate-800/80 text-[10px] font-mono text-slate-400 overflow-x-auto">
                      {JSON.stringify(t.inputSchema, null, 2)}
                    </pre>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 3: Living Website Flywheel */}
        {activeTab === 'flywheel' && (
          <div className="space-y-4 overflow-y-auto flex-1 pr-1 text-xs text-slate-300">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" /> The Living Website Evolution Flywheel
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                WebMCP turns websites into self-healing, adaptive systems. When a failure has an existing recovery recipe, agents resolve it immediately. When a novel failure occurs, it generates a diagnostic envelope that expands the site's permanent recovery surface:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3 bg-slate-900 border border-emerald-500/30 rounded-lg space-y-1">
                  <span className="text-[10px] font-mono font-bold uppercase text-emerald-400">Level 1: Existing Recovery</span>
                  <h5 className="font-semibold text-white">Instant Agent Resume</h5>
                  <p className="text-[11px] text-slate-400">
                    WebMCP capability already exists on page. Agent inspects capsule, checks invariants, applies recovery, and verifies completion in seconds.
                  </p>
                </div>

                <div className="p-3 bg-slate-900 border border-indigo-500/30 rounded-lg space-y-1">
                  <span className="text-[10px] font-mono font-bold uppercase text-indigo-400">Level 2: Novel Failure Escalation</span>
                  <h5 className="font-semibold text-white">Capability Expansion</h5>
                  <p className="text-[11px] text-slate-400">
                    Unhandled failure creates diagnostic capsule. Developer adds new recovery recipe ➔ Website permanently gains new recovery affordance for future sessions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
