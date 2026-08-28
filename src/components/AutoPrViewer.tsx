import React, { useState, useEffect } from 'react';
import {
  GitPullRequest,
  CheckCircle2,
  GitBranch,
  FileCode,
  Check,
  Play,
  Sparkles,
  GitMerge,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  UploadCloud,
  RefreshCw
} from 'lucide-react';
import { AutoFixPR } from '../../server/prPipeline';

export const AutoPrViewer: React.FC = () => {
  const [prs, setPrs] = useState<AutoFixPR[]>([]);
  const [expandedPr, setExpandedPr] = useState<string | null>(null);
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [pushFeedback, setPushFeedback] = useState<Record<string, string>>({});

  const fetchPrs = async () => {
    try {
      const res = await fetch('/api/prs');
      if (res.ok) {
        const data = await res.json();
        setPrs(data.prs || []);
        if (!expandedPr && data.prs?.length > 0) {
          setExpandedPr(data.prs[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchPrs();
    const interval = setInterval(fetchPrs, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleMerge = async (id: string) => {
    setMergingId(id);
    try {
      const res = await fetch(`/api/prs/${id}/merge`, { method: 'POST' });
      if (res.ok) {
        await fetchPrs();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setMergingId(null);
    }
  };

  const handlePushGitHub = async (id: string) => {
    setPushingId(id);
    try {
      const res = await fetch(`/api/prs/${id}/push-github`, { method: 'POST' });
      const data = await res.json();
      setPushFeedback((prev) => ({ ...prev, [id]: data.message || 'Pushed' }));
      await fetchPrs();
    } catch (e: any) {
      setPushFeedback((prev) => ({ ...prev, [id]: 'Push failed: ' + (e?.message || 'Error') }));
    } finally {
      setPushingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
        <div>
          <div className="flex items-center gap-2">
            <GitPullRequest className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Autonomous PR Pipeline & SCM Bridge</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            When source code defects cannot be hot-fixed via WebMCP, the agent auto-generates reproduction unit tests, code patches, and opens a GitHub PR.
          </p>
        </div>
        <div className="text-xs font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
          <GitBranch className="w-4 h-4" /> {prs.length} Pull Requests Generated
        </div>
      </div>

      {/* PR List */}
      <div className="space-y-4">
        {prs.map((pr) => {
          const isExpanded = expandedPr === pr.id;
          const isMerged = pr.status === 'merged';

          return (
            <div
              key={pr.id}
              className={`bg-slate-900/80 border rounded-2xl transition-all duration-200 overflow-hidden ${
                isMerged ? 'border-slate-800' : 'border-blue-500/40 shadow-xl'
              }`}
            >
              {/* Card Header */}
              <div
                onClick={() => setExpandedPr(isExpanded ? null : pr.id)}
                className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none"
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                      isMerged
                        ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                        : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    }`}
                  >
                    {isMerged ? <GitMerge className="w-5 h-5" /> : <GitPullRequest className="w-5 h-5" />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-blue-400">{pr.id}</span>
                      <span
                        className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${
                          isMerged
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                            : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                        }`}
                      >
                        {pr.status}
                      </span>
                      <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                        <GitBranch className="w-3 h-3" /> {pr.branch}
                      </span>
                      {pr.isPushedToGitHub && (
                        <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded flex items-center gap-1 font-mono">
                          <CheckCircle2 className="w-3 h-3" /> GitHub Synced
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-semibold text-white mt-1.5">{pr.title}</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      <span className="text-slate-300 font-medium">Root Cause:</span> {pr.rootCause}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end md:self-center flex-wrap">
                  {/* GitHub Actions */}
                  {pr.githubUrl ? (
                    <a
                      href={pr.githubUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> View on GitHub
                    </a>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePushGitHub(pr.id);
                      }}
                      disabled={pushingId === pr.id}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                    >
                      {pushingId === pr.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UploadCloud className="w-3.5 h-3.5 text-blue-400" />
                      )}
                      Push to GitHub
                    </button>
                  )}

                  {!isMerged && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMerge(pr.id);
                      }}
                      disabled={mergingId === pr.id}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-lg shadow-blue-950/40"
                    >
                      <GitMerge className="w-3.5 h-3.5" />
                      {mergingId === pr.id ? 'Merging...' : 'Merge PR'}
                    </button>
                  )}

                  <button className="text-slate-400 hover:text-slate-200 p-1">
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-200" /> : <ChevronRight className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Push Feedback Banner */}
              {pushFeedback[pr.id] && (
                <div className="px-5 py-2 bg-blue-950/40 border-t border-b border-blue-500/20 text-xs font-mono text-blue-300 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{pushFeedback[pr.id]}</span>
                </div>
              )}

              {/* Expanded PR Details */}
              {isExpanded && (
                <div className="p-5 border-t border-slate-800 bg-slate-950/70 space-y-5">
                  {/* Reproduction Test Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <FileCode className="w-3.5 h-3.5 text-blue-400" /> Auto-Generated Reproduction Unit Test
                      </h4>
                      <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> CI Test Passing
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400">{pr.reproductionTest.filename}</div>
                    <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-emerald-300 overflow-x-auto">
                      {pr.reproductionTest.code}
                    </pre>
                  </div>

                  {/* Patch / Git Diff Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <GitBranch className="w-3.5 h-3.5 text-blue-400" /> Unified Patch Diff
                      </h4>
                      <span className="text-xs font-mono text-slate-400">{pr.patch.targetFile}</span>
                    </div>
                    <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono overflow-x-auto text-slate-200 leading-relaxed">
                      {pr.patch.diff.split('\n').map((line, i) => (
                        <div
                          key={i}
                          className={
                            line.startsWith('+')
                              ? 'text-emerald-400 bg-emerald-950/30 -mx-3 px-3'
                              : line.startsWith('-')
                              ? 'text-rose-400 bg-rose-950/30 -mx-3 px-3'
                              : line.startsWith('@@')
                              ? 'text-cyan-400'
                              : 'text-slate-400'
                          }
                        >
                          {line}
                        </div>
                      ))}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
