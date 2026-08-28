import React, { useState, useEffect } from 'react';
import {
  Zap,
  Bot,
  Wrench,
  GitPullRequest,
  CheckCircle2,
  Clock,
  Coins,
  Cpu,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Filter,
  Activity,
  Terminal,
  Hash
} from 'lucide-react';
import { TriageResult, TriageStep } from '../../server/triageEngine';
import { SubAgentTask } from '../../server/providers/subAgentHarness';

interface AgentHarnessFeedProps {
  liveSteps: { packetId: string; step: TriageStep }[];
}

export const AgentHarnessFeed: React.FC<AgentHarnessFeedProps> = ({ liveSteps }) => {
  const [history, setHistory] = useState<TriageResult[]>([]);
  const [filter, setFilter] = useState<'all' | 'hotfix' | 'pr'>('all');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/harness/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.triageHistory || []);
        if (!expandedItem && data.triageHistory?.length > 0) {
          setExpandedItem(data.triageHistory[0].packetId);
        }
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
            <Zap className="w-6 h-6 text-amber-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Autonomous Agent Harness & Incident Feed</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time telemetry intake, Supervisor meta-reasoning, Sub-Agent task delegation, and in-browser WebMCP remediation logs.
          </p>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 self-start md:self-center text-xs font-semibold">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              filter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Incidents ({history.length})
          </button>
          <button
            onClick={() => setFilter('hotfix')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              filter === 'hotfix' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" /> State Hot-Fixes
          </button>
          <button
            onClick={() => setFilter('pr')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              filter === 'pr' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitPullRequest className="w-3.5 h-3.5" /> Auto-PRs
          </button>
        </div>
      </div>

      {/* Live Stream Banner (Active Ingestion) */}
      {liveSteps.length > 0 && (
        <div className="bg-slate-900/90 border border-amber-500/40 rounded-2xl p-5 shadow-xl space-y-3 animate-pulse">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <Activity className="w-4 h-4 animate-spin" /> Live Sub-Agent Harness Execution
            </span>
            <span className="text-xs font-mono text-slate-400">Packet: {liveSteps[liveSteps.length - 1]?.packetId}</span>
          </div>

          <div className="space-y-2">
            {liveSteps.slice(-3).map((item, idx) => (
              <div key={idx} className="flex items-start gap-2.5 text-xs bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded font-mono font-semibold">
                  {item.step.subAgent || item.step.step}
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

      {/* Incidents List */}
      <div className="space-y-4">
        {filteredHistory.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
            <Sparkles className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm font-medium text-slate-400">No active harness incidents recorded.</p>
            <p className="text-xs text-slate-500">Trigger chaos in the Live Sandbox to watch the Supervisor spawn sub-agents and heal the session.</p>
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
                {/* Summary Card Header */}
                <div
                  onClick={() => setExpandedItem(isExpanded ? null : item.packetId)}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none"
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                        isHotfix
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
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
                          {isHotfix ? 'State Hot-Fix Executed' : 'Codebase PR Created'}
                        </span>
                        <span className="text-xs font-mono text-rose-300 flex items-center gap-1">
                          <Hash className="w-3.5 h-3.5" /> {item.stickyBugHash}
                        </span>
                        <span className="text-xs font-mono text-slate-400">({item.packetId})</span>
                      </div>

                      <p className="text-sm font-medium text-slate-200 mt-2">{item.reasoning}</p>

                      <div className="flex items-center gap-3 mt-1.5 text-xs font-mono flex-wrap">
                        <span className="text-indigo-400 flex items-center gap-1">
                          <Bot className="w-3.5 h-3.5" /> {item.modelUsed}
                        </span>
                        {item.totalTokens && (
                          <span className="text-slate-400 flex items-center gap-1">
                            <Coins className="w-3.5 h-3.5 text-amber-400" /> {item.totalTokens} tokens
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                    <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                      <Clock className="w-3.5 h-3.5" />
                      {item.steps?.[0]?.timestamp ? new Date(item.steps[0].timestamp).toLocaleTimeString() : ''}
                    </span>
                    <button className="text-slate-400 hover:text-slate-200 p-1">
                      {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-200" /> : <ChevronRight className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details & Sub-Agent Tree */}
                {isExpanded && (
                  <div className="p-5 border-t border-slate-800 bg-slate-950/70 space-y-4">
                    {/* Sub-Agent Tree */}
                    {item.subAgents && item.subAgents.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-indigo-400" /> Spawned Sub-Agents & Execution Tree
                        </h4>

                        <div className="space-y-2">
                          {item.subAgents.map((sub) => (
                            <div
                              key={sub.id}
                              className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2.5 text-xs"
                            >
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                                    <Bot className="w-4 h-4 text-emerald-400" /> {sub.subAgentName}
                                  </span>
                                  <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 text-slate-300 rounded">
                                    {sub.modelUsed}
                                  </span>
                                </div>
                                <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> {sub.latencyMs}ms • {sub.tokensConsumed} tokens
                                </span>
                              </div>

                              <div className="space-y-1 pl-4 border-l-2 border-slate-800 text-slate-400 text-[11px] font-mono">
                                {sub.thoughtTrace.map((thought, idx) => (
                                  <div key={idx}>▸ {thought}</div>
                                ))}
                              </div>

                              {sub.dispatchedAction && (
                                <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800/80 font-mono text-[11px] text-emerald-300">
                                  <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">
                                    Authorized Dispatch: {sub.dispatchedAction.target}
                                  </div>
                                  <pre className="overflow-x-auto text-[11px]">
                                    {JSON.stringify(sub.dispatchedAction.parameters, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Step-by-Step Timeline */}
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-emerald-400" /> Supervisor Reasoning Timeline
                      </h4>

                      <div className="relative pl-6 space-y-3 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
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
                    </div>
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
