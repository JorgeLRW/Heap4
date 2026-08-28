import React from 'react';
import { CheckCircle2, GitPullRequest, X, Sparkles, Wrench } from 'lucide-react';

export interface RemediationToast {
  id: string;
  type: 'HOTFIX_APPLIED' | 'PR_OPENED' | 'PR_MERGED';
  title: string;
  message: string;
  toolName?: string;
  parameters?: any;
  pr?: any;
  timestamp: string;
}

interface NotificationToastProps {
  toasts: RemediationToast[];
  onDismiss: (id: string) => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-md w-full pointer-events-none">
      {toasts.map((toast) => {
        const isHotfix = toast.type === 'HOTFIX_APPLIED';
        const isPr = toast.type === 'PR_OPENED' || toast.type === 'PR_MERGED';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto border rounded-xl p-4 shadow-2xl backdrop-blur-xl transition-all duration-300 transform translate-y-0 animate-fade-in ${
              isHotfix
                ? 'bg-slate-900/95 border-emerald-500/50 shadow-emerald-950/40 text-slate-100'
                : 'bg-slate-900/95 border-blue-500/50 shadow-blue-950/40 text-slate-100'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  isHotfix ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                }`}
              >
                {isHotfix ? <Wrench className="w-5 h-5 animate-pulse" /> : <GitPullRequest className="w-5 h-5" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        isHotfix ? 'bg-emerald-500/20 text-emerald-300' : 'bg-blue-500/20 text-blue-300'
                      }`}
                    >
                      {isHotfix ? 'WebMCP Hot-Fix' : 'Autonomous PR'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(toast.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <button
                    onClick={() => onDismiss(toast.id)}
                    className="text-slate-400 hover:text-slate-200 transition-colors p-0.5 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <h4 className="text-sm font-semibold text-white mt-1.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  {toast.title}
                </h4>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">{toast.message}</p>

                {toast.toolName && (
                  <div className="mt-2 text-xs font-mono bg-slate-950/80 border border-slate-800 rounded p-1.5 text-emerald-400 truncate">
                    🔧 Executed: <span className="text-emerald-300 font-bold">{toast.toolName}()</span>
                  </div>
                )}

                {toast.pr && (
                  <div className="mt-2 flex items-center justify-between text-xs font-mono bg-slate-950/80 border border-slate-800 rounded p-1.5 text-blue-300">
                    <span>{toast.pr.id} • {toast.pr.branch}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded font-sans">Open</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
