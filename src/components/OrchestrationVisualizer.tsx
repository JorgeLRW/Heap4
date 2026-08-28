import React, { useState, useEffect } from 'react';
import {
  Layers,
  Bot,
  Zap,
  GitBranch,
  Shield,
  ArrowRight,
  Sparkles,
  Server,
  Cpu,
  CheckCircle2,
  Settings2,
  Workflow,
  Split,
  CircleDot
} from 'lucide-react';
import { OrchestratorConfig, ModelNodeConfig } from '../../server/providers/orchestrator';

export const OrchestrationVisualizer: React.FC = () => {
  const [config, setConfig] = useState<OrchestratorConfig>({
    mode: 'supervisor',
    supervisor: {
      provider: 'openai',
      model: 'gpt-4o',
      roleDescription: 'Meta-Model: High-level reasoning & task delegation',
    },
    stateWorker: {
      provider: 'ollama',
      model: 'llama3.1',
      roleDescription: 'State Specialist: Fast client-side cache & workflow hot-fixes',
    },
    codeWorker: {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      roleDescription: 'Code Specialist: Deep unit testing, patch diff synthesis & PR creation',
    },
    uniform: {
      provider: 'simulator',
      model: 'built-in-heuristic-engine',
      roleDescription: 'Single Uniform Engine: Handles all triage & code tasks',
    },
  });

  const [isSaved, setIsSaved] = useState<boolean>(false);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/orchestrator/config');
      if (res.ok) {
        const data = await res.json();
        if (data.config) setConfig(data.config);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async (updated: OrchestratorConfig) => {
    setConfig(updated);
    try {
      const res = await fetch('/api/orchestrator/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2500);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const providerOptions = [
    { value: 'simulator', label: 'Built-in Simulator' },
    { value: 'ollama', label: 'Ollama (Local AI)' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic Claude' },
    { value: 'gemini', label: 'Google Gemini' },
    { value: 'openrouter', label: 'OpenRouter' },
  ];

  const defaultModels: Record<string, string[]> = {
    simulator: ['built-in-heuristic-engine'],
    ollama: ['llama3.1', 'codellama', 'deepseek-coder', 'mistral'],
    openai: ['gpt-4o', 'gpt-4o-mini', 'o1-mini'],
    anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    gemini: ['gemini-1.5-pro', 'gemini-1.5-flash'],
    openrouter: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet'],
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
        <div>
          <div className="flex items-center gap-2">
            <Workflow className="w-6 h-6 text-indigo-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">AI Orchestrator Architecture</h2>
            <span className="px-2 py-0.5 text-xs font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-md">
              User-Configurable
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Determine how AI models oversee, judge, and resolve issues. Choose between a <strong>Supervisor Meta-Model</strong> that assigns specialist workers or a <strong>Uniform Single Model</strong>.
          </p>
        </div>

        {/* Mode Selector Pill */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 self-start md:self-center">
          <button
            onClick={() => handleSave({ ...config, mode: 'supervisor' })}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              config.mode === 'supervisor'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Split className="w-3.5 h-3.5" /> Supervisor & Workers
          </button>
          <button
            onClick={() => handleSave({ ...config, mode: 'uniform' })}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              config.mode === 'uniform'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CircleDot className="w-3.5 h-3.5" /> Uniform Single Model
          </button>
        </div>
      </div>

      {/* Visual Pipeline Graph */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            {config.mode === 'supervisor' ? 'Supervisor Multi-Model Pipeline' : 'Uniform Single-Model Pipeline'}
          </h3>
          {isSaved && (
            <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Architecture Saved
            </span>
          )}
        </div>

        {/* PIPELINE A: SUPERVISOR */}
        {config.mode === 'supervisor' ? (
          <div className="space-y-6">
            {/* Step 1: Supervisor Node */}
            <div className="p-5 bg-slate-950 border border-indigo-500/40 rounded-2xl space-y-3 shadow-lg shadow-indigo-950/30">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-indigo-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" /> 1. Supervisor Meta-Model (Oversees & Judges)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30">
                  Orchestrator Role
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Ingests the Sticky Bug telemetry trace, analyzes severity, and assigns the task to the optimal specialist model.
              </p>

              {/* Provider & Model Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Supervisor Provider</label>
                  <select
                    value={config.supervisor.provider}
                    onChange={(e) => {
                      const prov = e.target.value as any;
                      const models = defaultModels[prov] || ['default'];
                      handleSave({
                        ...config,
                        supervisor: { ...config.supervisor, provider: prov, model: models[0] },
                      });
                    }}
                    className="w-full p-2 bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg"
                  >
                    {providerOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Model Identifier</label>
                  <input
                    type="text"
                    value={config.supervisor.model}
                    onChange={(e) =>
                      handleSave({
                        ...config,
                        supervisor: { ...config.supervisor, model: e.target.value },
                      })
                    }
                    className="w-full p-2 bg-slate-900 border border-slate-800 text-xs font-mono text-indigo-300 rounded-lg"
                  />
                </div>
              </div>
            </div>

            {/* Split Indicator */}
            <div className="flex justify-center -my-2">
              <div className="px-4 py-1 bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-mono rounded-full flex items-center gap-1.5 shadow-md">
                <Split className="w-3.5 h-3.5 text-indigo-400" /> Supervisor Delegates by Root Cause
              </div>
            </div>

            {/* Step 2: Specialist Worker Nodes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* State Specialist Worker */}
              <div className="p-5 bg-slate-950 border border-emerald-500/30 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-emerald-400" /> State Specialist Worker
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded">
                    Hot-Fix Path
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Fast client-side cache remediation, localStorage repair & workflow unlocks via WebMCP.
                </p>
                <div className="space-y-2 pt-1">
                  <select
                    value={config.stateWorker.provider}
                    onChange={(e) => {
                      const prov = e.target.value as any;
                      const models = defaultModels[prov] || ['default'];
                      handleSave({
                        ...config,
                        stateWorker: { ...config.stateWorker, provider: prov, model: models[0] },
                      });
                    }}
                    className="w-full p-2 bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg"
                  >
                    {providerOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={config.stateWorker.model}
                    onChange={(e) =>
                      handleSave({
                        ...config,
                        stateWorker: { ...config.stateWorker, model: e.target.value },
                      })
                    }
                    className="w-full p-2 bg-slate-900 border border-slate-800 text-xs font-mono text-emerald-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Code Specialist Worker */}
              <div className="p-5 bg-slate-950 border border-blue-500/30 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                    <GitBranch className="w-4 h-4 text-blue-400" /> Codebase & PR Worker
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                    PR Path
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Synthesizes reproduction unit tests, safe TypeScript code patches, and submits GitHub PRs.
                </p>
                <div className="space-y-2 pt-1">
                  <select
                    value={config.codeWorker.provider}
                    onChange={(e) => {
                      const prov = e.target.value as any;
                      const models = defaultModels[prov] || ['default'];
                      handleSave({
                        ...config,
                        codeWorker: { ...config.codeWorker, provider: prov, model: models[0] },
                      });
                    }}
                    className="w-full p-2 bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg"
                  >
                    {providerOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={config.codeWorker.model}
                    onChange={(e) =>
                      handleSave({
                        ...config,
                        codeWorker: { ...config.codeWorker, model: e.target.value },
                      })
                    }
                    className="w-full p-2 bg-slate-900 border border-slate-800 text-xs font-mono text-blue-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* PIPELINE B: UNIFORM SINGLE MODEL */
          <div className="p-6 bg-slate-950 border border-indigo-500/40 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-300 flex items-center gap-2">
                <CircleDot className="w-4 h-4 text-indigo-400" /> Single Uniform AI Model
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30">
                End-to-End Engine
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              A single uniform model oversees, classifies, creates hot-fix parameters, and generates reproduction unit tests.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Uniform Provider</label>
                <select
                  value={config.uniform.provider}
                  onChange={(e) => {
                    const prov = e.target.value as any;
                    const models = defaultModels[prov] || ['default'];
                    handleSave({
                      ...config,
                      uniform: { ...config.uniform, provider: prov, model: models[0] },
                    });
                  }}
                  className="w-full p-2 bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg"
                >
                  {providerOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Model Identifier</label>
                <input
                  type="text"
                  value={config.uniform.model}
                  onChange={(e) =>
                    handleSave({
                      ...config,
                      uniform: { ...config.uniform, model: e.target.value },
                    })
                  }
                  className="w-full p-2 bg-slate-900 border border-slate-800 text-xs font-mono text-indigo-300 rounded-lg"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
