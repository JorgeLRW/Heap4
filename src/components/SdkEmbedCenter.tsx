import React, { useState } from 'react';
import {
  Code,
  Copy,
  Check,
  Terminal,
  Shield,
  Layers,
  Sparkles,
  ExternalLink,
  BookOpen,
  Key,
  CheckCircle2
} from 'lucide-react';

export const SdkEmbedCenter: React.FC = () => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyToClipboard = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    setTimeout(() => setCopiedSection(null), 2500);
  };

  const scriptTagCode = `<script 
  src="https://cdn.webmcp.io/v2/sdk.js" 
  data-app-id="app_acme_production" 
  data-authority="https://authority.webmcp.io"
  async>
</script>`;

  const reactCode = `import { useEffect } from 'react';
import { initWebMCP } from '@webmcp/browser';

export function App() {
  useEffect(() => {
    const { registry } = initWebMCP({
      appId: 'app_acme_production',
      authorityUrl: 'wss://authority.webmcp.io/ws',
    });

    // 1. Declare client-side repair tools
    registry.registerTool({
      name: 'repair_user_session',
      description: 'Clears corrupt client cache and re-syncs state from server',
      permission: 'mutate', // 'read' | 'mutate' | 'destructive'
      parameters: {
        type: 'object',
        properties: {
          resetKeys: { type: 'array', items: { type: 'string' } },
        },
        required: ['resetKeys'],
      },
      handler: async ({ resetKeys }) => {
        resetKeys.forEach(k => localStorage.removeItem(k));
        await refetchUserState();
        return { status: 'success', message: 'Session restored.' };
      },
    });
  }, []);

  return <YourApplicationRoot />;
}`;

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
        <div>
          <div className="flex items-center gap-2">
            <Code className="w-6 h-6 text-emerald-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Developer SDK & Integration Hub</h2>
            <span className="px-2 py-0.5 text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md">
              @webmcp/browser
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Embed the lightweight WebMCP SDK into your web applications to enable autonomous in-browser incident triage and state repair.
          </p>
        </div>

        <div className="text-xs font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5 self-start md:self-center">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> v2.1.0 Ready
        </div>
      </div>

      {/* Option 1: 1-Line Script Tag (No Build Step) */}
      <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center">
              1
            </span>
            <h3 className="text-sm font-bold text-white">Instant 1-Line Script Tag Integration</h3>
          </div>
          <button
            onClick={() => copyToClipboard(scriptTagCode, 'script')}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 border border-slate-700"
          >
            {copiedSection === 'script' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedSection === 'script' ? 'Copied' : 'Copy Snippet'}
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Drop this snippet before the closing <code className="text-emerald-400">&lt;/body&gt;</code> tag of any HTML, WordPress, Shopify, or static website:
        </p>
        <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-emerald-300 overflow-x-auto">
          {scriptTagCode}
        </pre>
      </div>

      {/* Option 2: NPM Package (React / Next.js / Vue) */}
      <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 font-bold text-xs flex items-center justify-center">
              2
            </span>
            <h3 className="text-sm font-bold text-white">NPM Package Installation & React Hook</h3>
          </div>
          <button
            onClick={() => copyToClipboard(reactCode, 'react')}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 border border-slate-700"
          >
            {copiedSection === 'react' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedSection === 'react' ? 'Copied' : 'Copy Code'}
          </button>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-300 flex items-center justify-between">
          <span>npm install @webmcp/browser</span>
          <button
            onClick={() => copyToClipboard('npm install @webmcp/browser', 'npm')}
            className="text-slate-400 hover:text-slate-200"
          >
            {copiedSection === 'npm' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-blue-300 overflow-x-auto">
          {reactCode}
        </pre>
      </div>

      {/* Security & Governance Cheatsheet */}
      <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-400" /> WebMCP Permission Tiers
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
            <span className="font-bold text-blue-400 uppercase font-mono">permission: 'read'</span>
            <p className="text-slate-400 text-[11px]">Safe diagnostic snapshots. Cannot alter state or mutate user data.</p>
          </div>
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
            <span className="font-bold text-amber-400 uppercase font-mono">permission: 'mutate'</span>
            <p className="text-slate-400 text-[11px]">In-browser state hot-fixes. Clears cache, unlocks wizards.</p>
          </div>
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
            <span className="font-bold text-rose-400 uppercase font-mono">permission: 'destructive'</span>
            <p className="text-slate-400 text-[11px]">Destructive resets (database wipe). Requires prompt or confirmation.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
