import React, { useState, useEffect } from 'react';
import {
  Hash,
  Search,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Upload,
  Paperclip,
  Clock,
  User,
  Wrench,
  GitPullRequest,
  ChevronDown,
  ChevronRight,
  Download,
  Share2,
  Copy,
  Check,
  Sparkles,
  Plus
} from 'lucide-react';
import { StickyBug, StickyBugAttachment } from '../webmcp/stickyBugs';

export const StickyBugsHub: React.FC = () => {
  const [bugs, setBugs] = useState<StickyBug[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBug, setSelectedBug] = useState<StickyBug | null>(null);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState<boolean>(false);
  const [submitHash, setSubmitHash] = useState<string>('');
  const [submitSummary, setSubmitSummary] = useState<string>('');
  const [attachedFiles, setAttachedFiles] = useState<StickyBugAttachment[]>([]);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchBugs = async () => {
    try {
      const res = await fetch('/api/sticky-bugs');
      if (res.ok) {
        const data = await res.json();
        setBugs(data.bugs || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchBugs();
    const interval = setInterval(fetchBugs, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2500);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: StickyBugAttachment[] = [];
    Array.from(files).forEach((file) => {
      newAttachments.push({
        name: file.name,
        sizeBytes: file.size,
        type: file.type || 'application/octet-stream',
      });
    });

    setAttachedFiles((prev) => [...prev, ...newAttachments]);
  };

  const handleSubmitStickyBug = async () => {
    if (!submitHash.trim()) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/sticky-bugs/${encodeURIComponent(submitHash.trim())}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userSummary: submitSummary,
          attachments: attachedFiles,
        }),
      });

      if (res.ok) {
        await fetchBugs();
        setIsSubmitModalOpen(false);
        setSubmitHash('');
        setSubmitSummary('');
        setAttachedFiles([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredBugs = bugs.filter((bug) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      bug.hash.toLowerCase().includes(q) ||
      bug.title.toLowerCase().includes(q) ||
      bug.errorMessage.toLowerCase().includes(q) ||
      (bug.userSummary && bug.userSummary.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
        <div>
          <div className="flex items-center gap-2">
            <Hash className="w-6 h-6 text-rose-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Sticky Bugs Hub</h2>
            <span className="px-2 py-0.5 text-xs font-mono bg-rose-500/10 text-rose-300 border border-rose-500/20 rounded-md">
              Hash Fingerprints
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Every browser anomaly receives a unique Sticky Bug Hash (<code className="text-rose-300">sb-...</code>) for instant reproduction, file attachment, and autonomous remediation tracking.
          </p>
        </div>

        {/* Action Button */}
        <button
          onClick={() => setIsSubmitModalOpen(true)}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-rose-950/40 shrink-0 self-start md:self-center"
        >
          <Plus className="w-4 h-4" /> Submit Sticky Bug
        </button>
      </div>

      {/* Search & Stats Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Sticky Bug Hash (e.g. sb-8f2a1b), error text, or keywords..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500/50"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0 font-mono">
          <span className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl">
            Total: <span className="font-bold text-white">{bugs.length}</span>
          </span>
        </div>
      </div>

      {/* Sticky Bugs List */}
      <div className="space-y-4">
        {filteredBugs.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-10 text-center space-y-2">
            <Hash className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm font-medium text-slate-400">No matching Sticky Bugs found.</p>
            <p className="text-xs text-slate-500">Trigger a chaos scenario in the Demo App or submit a hash above.</p>
          </div>
        ) : (
          filteredBugs.map((bug) => {
            const isSelected = selectedBug?.hash === bug.hash;

            return (
              <div
                key={bug.hash}
                className={`bg-slate-900/80 border rounded-2xl transition-all duration-200 overflow-hidden ${
                  isSelected ? 'border-rose-500/40 shadow-xl' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Bug Header Card */}
                <div
                  onClick={() => setSelectedBug(isSelected ? null : bug)}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 shrink-0 mt-0.5">
                      <Hash className="w-5 h-5" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-rose-300">{bug.hash}</span>
                        <span
                          className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${
                            bug.status === 'hotfix_applied'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : bug.status === 'pr_opened'
                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          }`}
                        >
                          {bug.status.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-slate-500">• User: {bug.userId}</span>
                      </div>

                      <h3 className="text-sm font-semibold text-white mt-1.5">{bug.title}</h3>

                      {bug.assignedModel && (
                        <p className="text-xs font-mono text-slate-400 mt-1">
                          🤖 <span className="text-slate-300 font-medium">Assigned:</span> {bug.assignedModel}
                        </p>
                      )}

                      {bug.userSummary && (
                        <p className="text-xs text-slate-300 mt-1 italic bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                          "{bug.userSummary}"
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyHash(bug.hash);
                      }}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono transition-all flex items-center gap-1 border border-slate-700"
                      title="Copy Sticky Bug Hash"
                    >
                      {copiedHash === bug.hash ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedHash === bug.hash ? 'Copied' : 'Copy Hash'}</span>
                    </button>

                    <button className="text-slate-400 hover:text-slate-200 p-1">
                      {isSelected ? <ChevronDown className="w-5 h-5 text-slate-200" /> : <ChevronRight className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isSelected && (
                  <div className="p-5 border-t border-slate-800 bg-slate-950/70 space-y-4">
                    {/* Error & Stack Trace */}
                    <div>
                      <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Error Trace & Context
                      </h4>
                      <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-rose-300 overflow-x-auto">
                        {bug.stackTrace || bug.errorMessage}
                      </pre>
                    </div>

                    {/* Attached Files */}
                    {bug.attachedFiles && bug.attachedFiles.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-2">
                          <Paperclip className="w-3.5 h-3.5 text-blue-400" /> Attached Diagnostics ({bug.attachedFiles.length})
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {bug.attachedFiles.map((file, i) => (
                            <div
                              key={i}
                              className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center gap-2 truncate">
                                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                                <span className="text-slate-200 truncate font-mono">{file.name}</span>
                              </div>
                              <span className="text-[10px] text-slate-500 font-mono">{(file.sizeBytes / 1024).toFixed(1)} KB</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Submit / Enrich Sticky Bug Modal */}
      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Hash className="w-4 h-4 text-rose-400" /> Submit / Enrich Sticky Bug
              </h3>
              <button
                onClick={() => setIsSubmitModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Sticky Bug Hash</label>
              <input
                type="text"
                value={submitHash}
                onChange={(e) => setSubmitHash(e.target.value)}
                placeholder="e.g. sb-8f2a1b-3c4d"
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-rose-300 focus:outline-none focus:border-rose-500"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Submit hash alone for quick telemetry lookup, or attach files below.
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">User Notes / Reproduction Summary</label>
              <textarea
                value={submitSummary}
                onChange={(e) => setSubmitSummary(e.target.value)}
                placeholder="What happened when the error occurred? (optional)..."
                rows={3}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Attach Files (Screenshots, HAR, JSON)</label>
              <input
                type="file"
                multiple
                onChange={handleFileUpload}
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-400 file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700"
              />
              {attachedFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  {attachedFiles.map((f, idx) => (
                    <div key={idx} className="text-[11px] text-emerald-400 font-mono flex items-center gap-1.5">
                      <Paperclip className="w-3 h-3" /> {f.name} ({(f.sizeBytes / 1024).toFixed(1)} KB)
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setIsSubmitModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitStickyBug}
                disabled={isSubmitting || !submitHash.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-rose-950/40"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Submit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
