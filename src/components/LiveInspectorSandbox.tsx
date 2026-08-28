import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Cpu,
  Wifi,
  Shield,
  Layers,
  Zap,
  Activity,
  CheckCircle2,
  RefreshCw,
  Hash,
  Sparkles,
  Bot
} from 'lucide-react';
import { NexusApp } from './NexusApp';
import { getWebMCP, WebMCPExportedTool } from '../webmcp';

export const LiveInspectorSandbox: React.FC = () => {
  const [tools, setTools] = useState<WebMCPExportedTool[]>([]);
  const [liveLogs, setLiveLogs] = useState<Array<{ text: string; time: string; type: 'info' | 'warn' | 'success' }>>([
    { text: 'WebSocket RPC Link connected to WebMCP Agent Authority.', time: new Date().toLocaleTimeString(), type: 'info' },
    { text: 'Discovered 12 declared in-page WebMCP tools.', time: new Date().toLocaleTimeString(), type: 'success' },
  ]);

  useEffect(() => {
    const { registry } = getWebMCP();
    setTools(registry.listTools());

    const unsub1 = registry.on('tool:executing', (d) => {
      setLiveLogs((prev) => [
        ...prev.slice(-15),
        { text: `⚡ Sub-Agent executing: ${d.name}() with params ${JSON.stringify(d.params)}`, time: new Date().toLocaleTimeString(), type: 'warn' },
      ]);
    });

    const unsub2 = registry.on('tool:executed', (d) => {
      setLiveLogs((prev) => [
        ...prev.slice(-15),
        { text: `✅ Execution finished: ${d.toolName} (${d.status}) in ${d.executionTimeMs}ms`, time: new Date().toLocaleTimeString(), type: 'success' },
      ]);
    });

    const unsub3 = registry.on('telemetry:captured', (p) => {
      setLiveLogs((prev) => [
        ...prev.slice(-15),
        { text: `🚨 Sticky Bug Anomaly Intercepted: "${p.error.message.substring(0, 45)}..."`, time: new Date().toLocaleTimeString(), type: 'warn' },
      ]);
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-2 sm:p-4 animate-fade-in">
      {/* Header */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Live Connected App & Sub-Agent Sandbox</h2>
            <span className="px-2 py-0.5 text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md">
              Side-by-Side Agency
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Trigger real-world failures on the target site (left) and watch the Agent Authority spawn sub-agents to hot-fix the session in real time (right).
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl self-start sm:self-center">
          <Wifi className="w-3.5 h-3.5" />
          <span>Active Tab RPC Link: ONLINE</span>
        </div>
      </div>

      {/* Split Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left 7 Cols: Interactive Target App */}
        <div className="xl:col-span-7 space-y-4">
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-1 shadow-xl overflow-hidden">
            <div className="px-4 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Target App: Nexus Commerce (WebMCP Client SDK v2.1)
              </span>
              <span>URL: http://localhost:5173</span>
            </div>
            <div className="p-2 sm:p-4">
              <NexusApp />
            </div>
          </div>
        </div>

        {/* Right 5 Cols: Real-Time Sub-Agent Terminal */}
        <div className="xl:col-span-5 space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col h-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Sub-Agent RPC Inspector</h3>
              </div>
              <span className="text-xs font-mono text-slate-400">{tools.length} Tools Discovered</span>
            </div>

            {/* Discovered Tools Chips */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-400 block">Client Declared WebMCP Endpoints:</span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {tools.map((t) => (
                  <span
                    key={t.name}
                    className="px-2 py-0.5 bg-slate-950 border border-slate-800 text-[10px] font-mono text-emerald-400 rounded"
                  >
                    {t.name}()
                  </span>
                ))}
              </div>
            </div>

            {/* Live RPC Event Log Terminal */}
            <div className="flex-1 space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 block">Live Telemetry & Sub-Agent Activity:</span>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs space-y-2 h-80 overflow-y-auto">
                {liveLogs.map((log, idx) => (
                  <div
                    key={idx}
                    className={`leading-relaxed ${
                      log.type === 'success'
                        ? 'text-emerald-300'
                        : log.type === 'warn'
                        ? 'text-amber-300'
                        : 'text-slate-400'
                    }`}
                  >
                    <span className="text-slate-600">[{log.time}]</span> {log.text}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl text-[11px] text-slate-400 space-y-1">
              <span className="font-semibold text-slate-300 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Autonomous In-Tab Hot-Fixing:
              </span>
              <p>
                When an anomaly occurs in the left panel, the Agent Authority evaluates the Sticky Bug, selects the matching tool, and dispatches the fix directly through the WebSocket connection.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
