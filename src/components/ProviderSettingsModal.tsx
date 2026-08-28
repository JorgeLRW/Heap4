import React, { useState, useEffect } from 'react';
import {
  X,
  Cpu,
  Key,
  Globe,
  GitBranch,
  Shield,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
  Server,
  Terminal,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { AIProviderConfig, SupportedAIProvider } from '../../server/providers/llmGateway';
import { GitHubConfig } from '../../server/providers/githubService';

interface ProviderSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiConfig: AIProviderConfig;
  onSaveAIConfig: (config: AIProviderConfig) => void;
  githubConfig: GitHubConfig;
  onSaveGitHubConfig: (config: GitHubConfig) => void;
}

export const ProviderSettingsModal: React.FC<ProviderSettingsModalProps> = ({
  isOpen,
  onClose,
  aiConfig,
  onSaveAIConfig,
  githubConfig,
  onSaveGitHubConfig,
}) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'github' | 'security'>('ai');

  // Local AI State
  const [provider, setProvider] = useState<SupportedAIProvider>(aiConfig.provider || 'simulator');
  const [apiKey, setApiKey] = useState<string>(aiConfig.apiKey || '');
  const [endpointUrl, setEndpointUrl] = useState<string>(aiConfig.endpointUrl || 'http://localhost:11434');
  const [model, setModel] = useState<string>(aiConfig.model || 'llama3.1');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isTestingAI, setIsTestingAI] = useState<boolean>(false);
  const [aiTestResult, setAiTestResult] = useState<{ valid: boolean; message: string; latencyMs?: number } | null>(null);

  // Local GitHub State
  const [ghToken, setGhToken] = useState<string>(githubConfig.token || '');
  const [ghRepo, setGhRepo] = useState<string>(githubConfig.repo || 'webmcp/core');
  const [ghBranch, setGhBranch] = useState<string>(githubConfig.defaultBranch || 'main');
  const [isTestingGH, setIsTestingGH] = useState<boolean>(false);
  const [ghTestResult, setGhTestResult] = useState<{ valid: boolean; message: string; repoDetails?: any } | null>(null);

  // Auto-fetch Ollama models when Ollama is selected
  const fetchOllamaModels = async () => {
    try {
      const res = await fetch(`/api/settings/ollama-models?endpoint=${encodeURIComponent(endpointUrl)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.models && data.models.length > 0) {
          setAvailableModels(data.models);
          if (!data.models.includes(model)) {
            setModel(data.models[0]);
          }
        }
      }
    } catch (e) {
      console.warn('Could not list local Ollama models:', e);
    }
  };

  useEffect(() => {
    if (provider === 'ollama') {
      fetchOllamaModels();
    }
  }, [provider, endpointUrl]);

  const handleTestAI = async () => {
    setIsTestingAI(true);
    setAiTestResult(null);
    try {
      const res = await fetch('/api/settings/validate-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey,
          endpointUrl,
          model,
        }),
      });
      const data = await res.json();
      setAiTestResult(data);
      if (data.models && data.models.length > 0) {
        setAvailableModels(data.models);
      }
    } catch (e: any) {
      setAiTestResult({ valid: false, message: e?.message || 'Connection error' });
    } finally {
      setIsTestingAI(false);
    }
  };

  const handleTestGH = async () => {
    setIsTestingGH(true);
    setGhTestResult(null);
    try {
      const res = await fetch('/api/settings/validate-github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: ghToken,
          repo: ghRepo,
          defaultBranch: ghBranch,
        }),
      });
      const data = await res.json();
      setGhTestResult(data);
    } catch (e: any) {
      setGhTestResult({ valid: false, message: e?.message || 'Connection error' });
    } finally {
      setIsTestingGH(false);
    }
  };

  const handleSaveAll = () => {
    onSaveAIConfig({
      provider,
      apiKey,
      endpointUrl,
      model,
    });

    onSaveGitHubConfig({
      token: ghToken,
      repo: ghRepo,
      defaultBranch: ghBranch,
    });

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Platform Settings & BYOK Hub</h2>
              <p className="text-xs text-slate-400">Configure LLM inference providers, GitHub PAT, and WebMCP security.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-6 pt-3 gap-2 bg-slate-950/40 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('ai')}
            className={`pb-3 px-3 flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'ai'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" /> AI Models (BYOK & Ollama)
          </button>
          <button
            onClick={() => setActiveTab('github')}
            className={`pb-3 px-3 flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'github'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitBranch className="w-4 h-4" /> GitHub / SCM Bridge
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`pb-3 px-3 flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'security'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" /> WebMCP Permission Gates
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* TAB 1: AI PROVIDER */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2">Active AI Inference Provider</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'simulator', name: 'Built-in Simulator', desc: 'Zero-config local' },
                    { id: 'ollama', name: 'Ollama (Local AI)', desc: 'Privacy-first localhost' },
                    { id: 'openai', name: 'OpenAI (GPT-4o)', desc: 'Official API' },
                    { id: 'anthropic', name: 'Anthropic Claude', desc: 'Claude 3.5 Sonnet' },
                    { id: 'gemini', name: 'Google Gemini', desc: 'Gemini 1.5 Pro' },
                    { id: 'openrouter', name: 'OpenRouter', desc: 'Universal gateway' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setProvider(p.id as SupportedAIProvider);
                        setAiTestResult(null);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        provider === p.id
                          ? 'bg-emerald-500/10 border-emerald-500/50 text-white shadow-sm'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span className={`text-xs font-bold block ${provider === p.id ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {p.name}
                      </span>
                      <span className="text-[10px] text-slate-500 mt-0.5 block">{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Ollama Endpoint Configuration */}
              {provider === 'ollama' && (
                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5" /> Ollama Local Server
                    </span>
                    <button
                      onClick={fetchOllamaModels}
                      className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Refresh Models
                    </button>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Ollama Host URL</label>
                    <input
                      type="text"
                      value={endpointUrl}
                      onChange={(e) => setEndpointUrl(e.target.value)}
                      placeholder="http://localhost:11434"
                      className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Selected Local Model</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="llama3.1, codellama, deepseek-coder"
                        className="flex-1 p-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                      />
                      {availableModels.length > 0 && (
                        <select
                          value={model}
                          onChange={(e) => setModel(e.target.value)}
                          className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-lg px-2"
                        >
                          {availableModels.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Cloud API Key Configuration */}
              {provider !== 'simulator' && provider !== 'ollama' && (
                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
                  <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5" /> API Key Authentication
                  </span>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      {provider.toUpperCase()} API Key (stored client-side)
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={`sk-... (${provider} secret key)`}
                      className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Model Name / Identifier</label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={provider === 'openai' ? 'gpt-4o' : provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gemini-1.5-pro'}
                      className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}

              {/* Test Button & Result */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={handleTestAI}
                  disabled={isTestingAI}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 border border-slate-700"
                >
                  {isTestingAI ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-amber-400" />}
                  Test Connection
                </button>

                {aiTestResult && (
                  <div
                    className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 border ${
                      aiTestResult.valid
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                    }`}
                  >
                    {aiTestResult.valid ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    <span>{aiTestResult.message}</span>
                    {aiTestResult.latencyMs && (
                      <span className="font-mono text-[10px] text-slate-400">({aiTestResult.latencyMs}ms)</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: GITHUB / SCM */}
          {activeTab === 'github' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5" /> GitHub Personal Access Token (PAT)
                  </span>
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
                  >
                    Create Token <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">GitHub Token (with 'repo' scope)</label>
                  <input
                    type="password"
                    value={ghToken}
                    onChange={(e) => setGhToken(e.target.value)}
                    placeholder="ghp_... or github_pat_..."
                    className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Optional. If left blank, the Auto-PR pipeline operates in high-fidelity local simulator mode.
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Target Repository (owner/repo)</label>
                    <input
                      type="text"
                      value={ghRepo}
                      onChange={(e) => setGhRepo(e.target.value)}
                      placeholder="owner/repo"
                      className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Default Base Branch</label>
                    <input
                      type="text"
                      value={ghBranch}
                      onChange={(e) => setGhBranch(e.target.value)}
                      placeholder="main"
                      className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Test Button & Result */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={handleTestGH}
                  disabled={isTestingGH}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 border border-slate-700"
                >
                  {isTestingGH ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5 text-blue-400" />}
                  Verify GitHub Token
                </button>

                {ghTestResult && (
                  <div
                    className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 border ${
                      ghTestResult.valid
                        ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                        : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                    }`}
                  >
                    {ghTestResult.valid ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    <span>{ghTestResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SECURITY & PERMISSIONS */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
                <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" /> WebMCP Permission Level Governance
                </span>
                <p className="text-xs text-slate-400 leading-relaxed">
                  WebMCP tools declare explicit permission tiers. You can control which levels the Agent can execute automatically without prompting the user.
                </p>

                <div className="space-y-2 pt-2">
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-blue-300">Read-Only Tools ('read')</span>
                      <p className="text-[11px] text-slate-500">Inspect state, fetch non-destructive telemetry snapshots.</p>
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs font-mono">Auto-Allowed</span>
                  </div>

                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-amber-300">State Mutation Tools ('mutate')</span>
                      <p className="text-[11px] text-slate-500">Purge corrupt storage cache, reset deadlocked workflows.</p>
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs font-mono">Auto-Allowed</span>
                  </div>

                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-rose-300">Destructive Actions ('destructive')</span>
                      <p className="text-[11px] text-slate-500">Permanent account wipe, workspace deletion.</p>
                    </div>
                    <span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 rounded text-xs font-mono">Requires Prompt</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/90">
          <span className="text-[11px] text-slate-500 font-mono">
            Provider: {provider} • GitHub: {ghRepo || 'simulated'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAll}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-emerald-950/50 flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
