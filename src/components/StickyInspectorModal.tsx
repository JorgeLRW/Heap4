import React, { useState } from 'react';
import {
  Bug,
  Code,
  FileText,
  Shield,
  Layers,
  X,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check
} from 'lucide-react';
import { StickyBug } from '../sticky/stickyStore';
import { ensureModelContext } from '../webmcp/modelContext';

interface StickyInspectorModalProps {
  bug: StickyBug | null;
  isOpen: boolean;
  onClose: () => void;
}

export const StickyInspectorModal: React.FC<StickyInspectorModalProps> = ({
  bug,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'bug' | 'tools'>('bug');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const tools = ensureModelContext().getToolsSync();

  const handleCopyJson = () => {
    if (bug) {
      navigator.clipboard.writeText(JSON.stringify(bug, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in text-slate-100">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('bug')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'bug'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Bug className="w-3.5 h-3.5" /> Sticky Bug Object {bug ? `(${bug.id})` : ''}
            </button>
            <button
              onClick={() => setActiveTab('tools')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'tools'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code className="w-3.5 h-3.5" /> navigator.modelContext Tools ({tools.length})
            </button>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab 1: Sticky Bug Object Details */}
        {activeTab === 'bug' && (
          <div className="space-y-4 overflow-y-auto flex-1 pr-1 text-xs">
            {bug ? (
              <>
                <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div>
                    <span className="font-mono text-rose-300 font-bold text-sm">{bug.id}</span>
                    <h3 className="font-semibold text-white mt-0.5">{bug.title}</h3>
                  </div>
                  <button
                    onClick={handleCopyJson}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-mono flex items-center gap-1 border border-slate-700"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied JSON' : 'Copy JSON'}</span>
                  </button>
                </div>

                {/* Screenshot Placeholder */}
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Captured DOM Snapshot / Screenshot
                  </span>
                  <div className="p-4 bg-slate-900 rounded-lg border border-slate-800 text-center text-slate-300 font-mono">
                    {bug.screenshotPlaceholder}
                  </div>
                </div>

                {/* Error & Stack */}
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Captured Error Trace
                  </span>
                  <pre className="p-2.5 bg-slate-900 rounded border border-slate-800 text-rose-300 font-mono overflow-x-auto text-[11px]">
                    {bug.error.stack || bug.error.message}
                  </pre>
                </div>

                {/* State Snapshot */}
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Captured Live Session State
                  </span>
                  <pre className="p-2.5 bg-slate-900 rounded border border-slate-800 text-emerald-300 font-mono overflow-x-auto text-[11px]">
                    {JSON.stringify(bug.capturedState, null, 2)}
                  </pre>
                </div>

                {/* Available Repairs */}
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Semantic WebMCP Repair Recipes ({bug.availableRepairs.length})
                  </span>
                  {bug.availableRepairs.map((r) => (
                    <div key={r.repairId} className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white font-mono">{r.repairId}</span>
                        <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded text-[10px] uppercase font-mono">
                          {r.risk}
                        </span>
                      </div>
                      <p className="text-slate-300 text-[11px]">{r.description}</p>
                    </div>
                  ))}
                </div>

                {/* Audit Trail */}
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Audit Trail & Lifecycle
                  </span>
                  <div className="space-y-1 text-[11px] font-mono">
                    {bug.auditTrail.map((entry, idx) => (
                      <div key={idx} className="flex items-center justify-between text-slate-400">
                        <span className="text-emerald-400 font-semibold">• {entry.action}</span>
                        <span className="text-slate-500">{entry.timestamp}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-slate-400 text-center py-8">No active Sticky Bug selected.</p>
            )}
          </div>
        )}

        {/* Tab 2: Discovered WebMCP Tools */}
        {activeTab === 'tools' && (
          <div className="space-y-3 overflow-y-auto flex-1 pr-1 text-xs">
            <p className="text-slate-400 text-xs">
              Tools dynamically registered on <code className="text-emerald-400 font-mono">navigator.modelContext</code> and discoverable by WebMCP agents (ChatGPT Desktop, Codex):
            </p>
            <div className="space-y-2">
              {tools.map((t) => (
                <div key={t.name} className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-emerald-400 text-xs">{t.name}()</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 text-slate-400 rounded">
                      Standard Tool
                    </span>
                  </div>
                  <p className="text-slate-300 text-xs">{t.description}</p>
                  <pre className="p-2 bg-slate-900 rounded border border-slate-800/80 text-[10px] font-mono text-slate-400 overflow-x-auto">
                    {JSON.stringify(t.inputSchema, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
