import React, { useState } from 'react';
import {
  GitPullRequest,
  GitMerge,
  CheckCircle2,
  AlertCircle,
  FileCode,
  X,
  Sparkles,
  ExternalLink,
  Code2,
  Clock,
  ArrowRight,
  ShieldCheck,
  Check
} from 'lucide-react';
import { GitHubEscalation, intentRuntime } from '../recovery/intentRuntime';

interface GitHubEscalationModalProps {
  escalation: GitHubEscalation | null;
  isOpen: boolean;
  onClose: () => void;
  onMerged?: () => void;
}

export const GitHubEscalationModal: React.FC<GitHubEscalationModalProps> = ({
  escalation,
  isOpen,
  onClose,
  onMerged,
}) => {
  const [isMerging, setIsMerging] = useState(false);
  const [isMerged, setIsMerged] = useState(escalation?.isMerged || false);

  if (!isOpen || !escalation) return null;

  const handleMergeAndDeploy = async () => {
    setIsMerging(true);
    await new Promise((r) => setTimeout(r, 700));

    intentRuntime.deployNewCapabilityFromPR(escalation.prNumber);
    escalation.isMerged = true;
    setIsMerged(true);
    setIsMerging(false);

    onMerged?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in text-slate-100 font-sans">
      <div className="bg-[#0e131f] border border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
              <GitPullRequest className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-slate-400">acme/finance-app</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  PR #{escalation.prNumber}
                </span>
                {isMerged && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 flex items-center gap-1">
                    <GitMerge className="w-3 h-3" /> Merged & Deployed
                  </span>
                )}
              </div>
              <h2 className="text-base font-bold text-white tracking-tight mt-0.5">
                {escalation.prTitle}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800/60 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-4 overflow-y-auto flex-1 pr-1 text-xs">
          {/* Loop 2 Architecture Explainer Banner */}
          <div className="p-4 bg-indigo-950/30 border border-indigo-500/30 rounded-xl space-y-1.5 text-slate-300">
            <span className="text-[10px] uppercase font-mono font-bold text-indigo-300 tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Loop 2: Capability Growth Engine
            </span>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              When runtime recovery encounters an unrecoverable bug (like a corrupted queue), the platform packages the reproduction, creates an engineering issue, and proposes this pull request. 
              <strong> Merging permanently expands the website's WebMCP recovery surface for future sessions!</strong>
            </p>
          </div>

          {/* Linked Issue & Diagnostic Context */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">Linked Issue</span>
              <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-rose-300">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Issue #{escalation.issueNumber}: {escalation.issueTitle}</span>
              </div>
              <p className="text-[11px] text-slate-400">{escalation.issueDescription}</p>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">Automated CI Reproduction</span>
              <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Reproduction Test: {escalation.reproductionStatus} ✓</span>
              </div>
              <p className="text-[11px] text-slate-400">{escalation.reproductionTest}</p>
            </div>
          </div>

          {/* Code Diff Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] uppercase font-mono font-semibold">Proposed Code Changes (1 file)</span>
              <span className="font-mono text-[10px] text-slate-500">packages/recovery/src/capabilities/mailQueue.ts</span>
            </div>
            <pre className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 leading-relaxed overflow-x-auto">
              <span className="text-emerald-400 font-semibold">{escalation.codeDiff}</span>
            </pre>
          </div>
        </div>

        {/* Footer Action */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400 font-mono">
            Target branch: <strong className="text-slate-200">main</strong>
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-all"
            >
              Close
            </button>

            {!isMerged ? (
              <button
                onClick={handleMergeAndDeploy}
                disabled={isMerging}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-purple-950/50 flex items-center gap-2"
              >
                {isMerging ? (
                  <>Merging & Deploying...</>
                ) : (
                  <>
                    <GitMerge className="w-3.5 h-3.5" /> Merge PR #{escalation.prNumber} & Deploy Capability
                  </>
                )}
              </button>
            ) : (
              <div className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" /> Capability Live in Production
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
