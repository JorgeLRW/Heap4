import React from 'react';
import { Layers, ShieldCheck, Zap, ArrowRight, Bot, User, Globe, Code, CheckCircle2 } from 'lucide-react';

export const ArchitectureExplorer: React.FC = () => {
  return (
    <div className="space-y-8 max-w-5xl mx-auto p-4 md:p-6 animate-fade-in">
      {/* Header */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-2">
          <Layers className="w-6 h-6 text-emerald-400" />
          <h2 className="text-xl font-bold text-white tracking-tight">WebMCP Architecture Standard</h2>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          How WebMCP bridges the browser's Human UI layer with deterministic AI Agent tool execution.
        </p>
      </div>

      {/* Interactive Layer Diagram */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider text-slate-300">
          The User Browser Execution Model
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Human UI Box */}
          <div className="p-5 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <User className="w-4 h-4 text-sky-400" /> Human UI Layer (DOM / CSS)
              </span>
              <span className="text-[10px] font-mono bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded border border-sky-500/20">
                Visual Clicks
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Buttons, forms, modals, canvas graphics. Rendered for human eyesight and interactive click gestures.
            </p>
            <div className="text-[11px] font-mono text-slate-500 bg-slate-900/60 p-2 rounded">
              Interaction: mouse clicks, touch, scroll events
            </div>
          </div>

          {/* WebMCP Layer Box */}
          <div className="p-5 bg-slate-950 border border-emerald-500/30 rounded-xl space-y-3 shadow-lg shadow-emerald-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-300 flex items-center gap-2">
                <Bot className="w-4 h-4 text-emerald-400" /> WebMCP Layer (Agent API)
              </span>
              <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                Typed JSON Schema
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Exposed via <code className="text-emerald-400">window.webmcp</code>. Functions execute deterministically inside the user's active session without DOM scraping.
            </p>
            <div className="text-[11px] font-mono text-emerald-400 bg-slate-900/60 p-2 rounded">
              Interaction: window.webmcp.executeTool(name, params)
            </div>
          </div>
        </div>

        {/* 5-Phase End-to-End Pipeline Visualization */}
        <div className="space-y-3 pt-4 border-t border-slate-800">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            End-to-End Autonomous Remediation Lifecycle
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <div className="text-[10px] font-bold text-emerald-400 font-mono">01. CAPTURE</div>
              <h5 className="text-xs font-semibold text-white">Client Interceptor</h5>
              <p className="text-[11px] text-slate-400">Listens to errors, logs, and state anomalies.</p>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <div className="text-[10px] font-bold text-emerald-400 font-mono">02. INGESTION</div>
              <h5 className="text-xs font-semibold text-white">Telemetry Bus</h5>
              <p className="text-[11px] text-slate-400">Packages DOM snapshot, stack trace, and declared tools.</p>
            </div>

            <div className="p-3 bg-slate-950 border border-emerald-500/30 rounded-xl space-y-1 bg-emerald-950/10">
              <div className="text-[10px] font-bold text-emerald-300 font-mono">03. TRIAGE</div>
              <h5 className="text-xs font-semibold text-white">LLM Decision Engine</h5>
              <p className="text-[11px] text-slate-300">Classifies state glitch vs codebase defect.</p>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <div className="text-[10px] font-bold text-emerald-400 font-mono">04. REMEDIATE</div>
              <h5 className="text-xs font-semibold text-white">Dual Path Fix</h5>
              <p className="text-[11px] text-slate-400">Hot-fix via WebMCP or create PR with repro test.</p>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <div className="text-[10px] font-bold text-emerald-400 font-mono">05. NOTIFY</div>
              <h5 className="text-xs font-semibold text-white">User Toast Loop</h5>
              <p className="text-[11px] text-slate-400">Alerts the user: "Issue resolved automatically."</p>
            </div>
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-white">Traditional Web Scraping vs. WebMCP Standard</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono">
                <th className="py-2.5 px-3">Dimension</th>
                <th className="py-2.5 px-3 text-rose-300">Traditional Web (Puppeteer/DOM)</th>
                <th className="py-2.5 px-3 text-emerald-300">WebMCP Standard</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              <tr>
                <td className="py-3 px-3 font-semibold text-white">Interaction Mechanism</td>
                <td className="py-3 px-3 text-slate-400">Brittle DOM scraping / synthetic click simulation</td>
                <td className="py-3 px-3 text-emerald-300 font-medium">Explicitly declared JSON Schema tool endpoints</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-semibold text-white">Reliability</td>
                <td className="py-3 px-3 text-slate-400">Breaks on minor CSS/HTML refactors</td>
                <td className="py-3 px-3 text-emerald-300 font-medium">Deterministic typed signatures with runtime validation</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-semibold text-white">Authentication & Session</td>
                <td className="py-3 px-3 text-slate-400">Headless cookie injection / OAuth complex handshakes</td>
                <td className="py-3 px-3 text-emerald-300 font-medium">Reuses active authenticated in-browser user session</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-semibold text-white">Token Efficiency</td>
                <td className="py-3 px-3 text-slate-400">Thousands of tokens transmitting raw HTML trees</td>
                <td className="py-3 px-3 text-emerald-300 font-medium">Concise function signatures (~150 tokens)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
