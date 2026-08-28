import React, { useState, useEffect } from 'react';
import {
  Activity,
  Bot,
  Wrench,
  GitPullRequest,
  CheckCircle2,
  Clock,
  Terminal,
  Code2,
  Eye,
  Filter,
  Sparkles,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { TriageResult, TriageStep } from '../../server/triageEngine';

interface TriageFeedProps {
  liveSteps: { packetId: string; step: TriageStep }[];
}

export const TriageFeed: React.FC<TriageFeedProps> = ({ liveSteps }) => {
  const [history, setHistory] = useState<TriageResult[]>([]);
  const [filter, setFilter] = useState<'all' | 'hotfix' | 'pr'>('all');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/triage/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 3000);
    return () => clearInterval(interval);
  }, []);

  const filteredHistory = history.filter((item) => {
    if (filter === 'hotfix') return item.remediationPath === 'WEBMCP_HOTFIX';
    if (filter === 'pr') return item.remediationPath === 'CODEBASE_PR';
    return true;
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-emerald-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Agent Triage & Decision Stream</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time telemetry ingestion, root cause classification, and autonomous remediation dispatch.
          </p>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Events
          </button>
          <button
            onClick={() => setFilter('hotfix')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              filter === 'hotfix' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" /> WebMCP Hot-Fixes
          </button>
          <button
            onClick={() => setFilter('pr')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              filter === 'pr' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitPullRequest className="w-3.5 h-3.5" /> Auto-PRs
          </button>
        </div>
      </div>

      {/* Live Active Stream (if currently processing) */}
      {liveSteps.length > 0 && (
        <div className="bg-slate-900/90 border border-amber-500/40 rounded-2xl p-5 shadow-xl space-y-3 animate-pulse">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <Activity className="w-4 h-4 animate-spin" /> Live Triage In Progress
            </span>
            <span className="text-xs font-mono text-slate-400">Packet: {liveSteps[liveSteps.length - 1]?.packetId}</span>
          </div>

          <div className="space-y-2">
            {liveSteps.slice(-3).map((item, idx) => (
              <div key={idx} className="flex items-start gap-2.5 text-xs bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded font-mono font-semibold">
                  {item.step.step}
                </span>
                <div className="flex-1">
                  <p className="font-semibold text-slate-200">{item.step.title}</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">{item.step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Triage Events History */}
      <div className="space-y-4">
        {filteredHistory.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
            <Sparkles className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm font-medium text-slate-400">No triage events recorded yet.</p>
            <p className="text-xs text-slate-500">Trigger a failure in the Chaos Injection Lab to watch the triage engine analyze and auto-fix!</p>
          </div>
        ) : (
          filteredHistory.map((item) => {
            const isExpanded = expandedItem === item.packetId;
            const isHotfix = item.remediationPath === 'WEBMCP_HOTFIX';

            return (
              <div
                key={item.packetId}
                className={`bg-slate-900/80 border rounded-2xl transition-all duration-200 overflow-hidden ${
                  isHotfix ? 'border-emerald-500/30' : 'border-blue-500/30'
                }`}
              >
                {/* Event Summary Card Header */}
                <div
                  onClick={() => setExpandedItem(isExpanded ? null : item.packetId)}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none"
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                        isHotfix ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}
                    >
                      {isHotfix ? <Wrench className="w-5 h-5" /> : <GitPullRequest className="w-5 h-5" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                            isHotfix
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                          }`}
                        >
                          {isHotfix ? 'WebMCP In-Page Hot-Fix' : 'Autonomous Codebase PR'}
                        </span>
                        <span className="text-xs font-mono text-slate-400">{item.packetId}</span>
                        <span className="text-xs text-slate-500">• Confidence: {(item.confidence * 100).toFixed(0)}%</span>
                      </div>

                      <p className="text-sm font-medium text-slate-200 mt-2">{item.reasoning}</p>

                      {isHotfix && item.webmcpAction && (
                        <p className="text-xs font-mono text-emerald-400 mt-1">
                          🔧 Executed: <span className="font-bold">{item.webmcpAction.toolName}()</span>
                        </p>
                      )}

                      {!isHotfix && item.prAction && (
                        <p className="text-xs font-mono text-blue-400 mt-1">
                          📦 Opened: <span className="font-bold">{item.prAction.id}</span> ({item.prAction.branch})
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {item.steps?.[0]?.timestamp ? new Date(item.steps[0].timestamp).toLocaleTimeString() : ''}
                    </span>
                    <button className="text-slate-400 hover:text-slate-200">
                      {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-200" /> : <ChevronRight className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Step Trace */}
                {isExpanded && (
                  <div className="p-5 border-t border-slate-800 bg-slate-950/60 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-emerald-400" /> Multi-Step Agent Reasoning Trace
                    </h4>

                    <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                      {item.steps?.map((step, idx) => (
                        <div key={idx} className="relative">
                          <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-slate-950" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-200">{step.title}</span>
                              <span className="text-[10px] font-mono text-slate-500">
                                {new Date(step.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">{step.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {isHotfix && item.webmcpAction && (
                      <div className="mt-4 p-3 bg-slate-900 border border-emerald-500/20 rounded-xl space-y-1">
                        <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                          WebMCP Payload Dispatched to Client:
                        </span>
                        <pre className="text-xs font-mono text-emerald-300 overflow-x-auto">
                          {JSON.stringify(item.webmcpAction.parameters, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
