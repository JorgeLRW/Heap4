import React, { useState, useEffect } from 'react';
import {
  Wrench,
  Shield,
  Play,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileCode,
  Terminal,
  Search,
  Layers,
  Activity,
  GitBranch,
  Filter
} from 'lucide-react';
import { getWebMCP, WebMCPExportedTool } from '../webmcp';

export const ToolCatalogViewer: React.FC = () => {
  const [tools, setTools] = useState<WebMCPExportedTool[]>([]);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [testParams, setTestParams] = useState<Record<string, string>>({});
  const [executionOutputs, setExecutionOutputs] = useState<Record<string, any>>({});
  const [isExecuting, setIsExecuting] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<'all' | 'in_page' | 'observability' | 'scm'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const refreshTools = () => {
    const { registry } = getWebMCP();
    setTools(registry.listTools());
  };

  useEffect(() => {
    refreshTools();
    const { registry } = getWebMCP();
    const unsub1 = registry.on('tool:registered', () => refreshTools());
    const unsub2 = registry.on('tool:unregistered', () => refreshTools());

    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  const categorizeTool = (toolName: string): 'in_page' | 'observability' | 'scm' => {
    if (toolName.includes('git') || toolName.includes('test') || toolName.includes('pr')) return 'scm';
    if (toolName.includes('har') || toolName.includes('sticky') || toolName.includes('export')) return 'observability';
    return 'in_page';
  };

  const handleManualExecute = async (toolName: string) => {
    const { registry } = getWebMCP();
    setIsExecuting(toolName);

    try {
      const raw = testParams[toolName] || '{}';
      let parsed = {};
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        setExecutionOutputs((prev) => ({
          ...prev,
          [toolName]: { status: 'error', error: 'Invalid JSON parameters syntax' },
        }));
        setIsExecuting(null);
        return;
      }

      const result = await registry.executeTool(toolName, parsed);
      setExecutionOutputs((prev) => ({ ...prev, [toolName]: result }));
    } catch (err: any) {
      setExecutionOutputs((prev) => ({
        ...prev,
        [toolName]: { status: 'error', error: err?.message || String(err) },
      }));
    } finally {
      setIsExecuting(null);
    }
  };

  const filteredTools = tools.filter((tool) => {
    const cat = categorizeTool(tool.name);
    if (activeCategory !== 'all' && cat !== activeCategory) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return tool.name.toLowerCase().includes(q) || tool.description.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
        <div>
          <div className="flex items-center gap-2">
            <Wrench className="w-6 h-6 text-emerald-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">WebMCP Tool Registry</h2>
            <span className="px-2 py-0.5 text-xs font-mono bg-slate-800 text-slate-300 border border-slate-700 rounded-md">
              window.webmcp
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Genuine list of in-page, observability, and code remediation tools discoverable and executable by AI Agents.
          </p>
        </div>
        <div className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {tools.length} Tools Registered
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs font-semibold w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeCategory === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Tools ({tools.length})
          </button>
          <button
            onClick={() => setActiveCategory('in_page')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeCategory === 'in_page' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> In-Page WebMCP
          </button>
          <button
            onClick={() => setActiveCategory('observability')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeCategory === 'observability' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" /> Observability
          </button>
          <button
            onClick={() => setActiveCategory('scm')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeCategory === 'scm' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" /> Code & SCM
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tools & schemas..."
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Tools List */}
      <div className="space-y-3">
        {filteredTools.map((tool) => {
          const isExpanded = expandedTool === tool.name;
          const output = executionOutputs[tool.name];
          const category = categorizeTool(tool.name);

          return (
            <div
              key={tool.name}
              className={`bg-slate-900/80 border rounded-2xl transition-all duration-200 overflow-hidden ${
                isExpanded ? 'border-emerald-500/40 shadow-xl' : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Tool Header Row */}
              <div
                onClick={() => setExpandedTool(isExpanded ? null : tool.name)}
                className="p-4 flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center gap-3">
                  <button className="text-slate-400 hover:text-slate-200">
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-emerald-400" /> : <ChevronRight className="w-5 h-5" />}
                  </button>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-sm font-semibold text-emerald-400">{tool.name}()</span>
                      <span
                        className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${
                          tool.permission === 'read'
                            ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                            : tool.permission === 'mutate'
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                        }`}
                      >
                        {tool.permission}
                      </span>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        {category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">{tool.description}</p>
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-slate-400">
                  <span>{Object.keys(tool.parameters?.properties || {}).length} params</span>
                </div>
              </div>

              {/* Tool Expanded Body */}
              {isExpanded && (
                <div className="px-5 pb-5 pt-2 border-t border-slate-800/80 bg-slate-950/40 space-y-4">
                  {/* Schema Section */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-2">
                      <FileCode className="w-3.5 h-3.5 text-emerald-400" /> JSON Schema Specification
                    </h4>
                    <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-300 overflow-x-auto">
                      {JSON.stringify(tool.parameters, null, 2)}
                    </pre>
                  </div>

                  {/* Manual Test Execution Sandbox */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-amber-400" /> Developer Test Sandbox
                    </h4>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <textarea
                        value={testParams[tool.name] ?? JSON.stringify(tool.parameters.properties ? { resetKeys: ['nexus_user_cart'], forceReset: true, maxEvents: 3 } : {}, null, 2)}
                        onChange={(e) => setTestParams({ ...testParams, [tool.name]: e.target.value })}
                        placeholder="JSON parameters..."
                        rows={3}
                        className="flex-1 p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500/60"
                      />
                      <button
                        onClick={() => handleManualExecute(tool.name)}
                        disabled={isExecuting === tool.name}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 self-start"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        {isExecuting === tool.name ? 'Executing...' : 'Invoke Tool'}
                      </button>
                    </div>
                  </div>

                  {/* Execution Output */}
                  {output && (
                    <div className="space-y-1">
                      <h5 className="text-[11px] font-semibold text-slate-400">Execution Result:</h5>
                      <pre
                        className={`p-3 rounded-xl border text-xs font-mono overflow-x-auto ${
                          output.status === 'success'
                            ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                            : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                        }`}
                      >
                        {JSON.stringify(output, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
