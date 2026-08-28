import React, { useEffect, useState } from 'react';
import { CheckCircle2, Cpu, FileCode2, ShieldCheck, Wrench, X } from 'lucide-react';
import { intentRuntime } from '../client/heap/intentRuntime';
import type { RepairJob } from '../shared/demoApiTypes';

interface DeveloperRepairPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeveloperRepairPanel: React.FC<DeveloperRepairPanelProps> = ({ isOpen, onClose }) => {
  const [currentBuild, setCurrentBuild] = useState(intentRuntime.getCurrentBuild());
  const [repairJob, setRepairJob] = useState<RepairJob | null>(intentRuntime.getRepairJob());
  const [working, setWorking] = useState<'requesting' | 'deploying' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      setCurrentBuild(intentRuntime.getCurrentBuild());
      setRepairJob(intentRuntime.getRepairJob());
    };
    update();
    return intentRuntime.subscribe(update);
  }, []);

  if (!isOpen) return null;

  const requestRepair = async () => {
    setWorking('requesting');
    setError(null);
    try {
      await intentRuntime.requestRepair('int_2841');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(null);
    }
  };

  const deployRepair = async () => {
    setWorking('deploying');
    setError(null);
    try {
      await intentRuntime.deployRepair();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(null);
    }
  };

  const isRepaired = currentBuild === 'demo-build-b';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 text-slate-100">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0d121f] border border-slate-700/80 rounded-2xl shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
            <Wrench className="w-4 h-4" />
            <span>ENGINEERING REVIEW BOUNDARY</span>
          </div>
          <button onClick={onClose} aria-label="Close engineering panel" className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <span className="text-slate-500 block mb-1">Application build</span>
            <span className={isRepaired ? 'font-mono text-emerald-400' : 'font-mono text-amber-300'}>{currentBuild}</span>
          </div>
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <span className="text-slate-500 block mb-1">Deployment authority</span>
            <span className="font-mono text-white">Human approval required</span>
          </div>
        </div>

        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1.5">
          <span className="text-slate-500 uppercase tracking-wider text-[10px] font-bold">Correlated failure</span>
          <div className="font-mono text-rose-300">DeliveryService.ts:42 · DELIVERY_PROVIDER_CONFIGURATION_ERROR</div>
          <div className="text-slate-400">The invoice already exists. Only its unfinished delivery step may be retried.</div>
        </div>

        {!repairJob && !isRepaired && (
          <button
            onClick={requestRepair}
            disabled={working !== null}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <Cpu className="w-4 h-4" />
            {working === 'requesting' ? 'Preparing scoped repair…' : 'Prepare reviewable repair'}
          </button>
        )}

        {repairJob && (
          <div className="space-y-3">
            <div className="p-3 bg-indigo-950/20 border border-indigo-500/30 rounded-xl text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-indigo-300">{repairJob.id}</span>
                <span className="text-[10px] uppercase tracking-wider text-amber-300">{repairJob.status.replaceAll('_', ' ')}</span>
              </div>
              <p className="text-slate-300 leading-relaxed">{repairJob.diagnosis}</p>
            </div>

            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <div className="px-3 py-2 bg-slate-900 flex items-center gap-2 text-xs text-slate-300">
                <FileCode2 className="w-4 h-4 text-emerald-400" />
                <span className="font-mono">{repairJob.artifact.file}</span>
              </div>
              <pre className="p-3 bg-slate-950 text-[11px] leading-relaxed text-emerald-200 overflow-x-auto whitespace-pre-wrap">{repairJob.artifact.patch}</pre>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs">
              <span className="text-slate-500 block mb-1">Regression assertion</span>
              <p className="text-slate-300">{repairJob.artifact.regressionTest}</p>
            </div>

            {!isRepaired && (
              <button
                onClick={deployRepair}
                disabled={working !== null}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                {working === 'deploying' ? 'Deploying approved repair…' : 'Approve patch and deploy demo-build-b'}
              </button>
            )}
          </div>
        )}

        {isRepaired && (
          <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-center text-xs text-emerald-300 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Approved repair deployed. The original intent is now resumable through WebMCP.
          </div>
        )}

        {error && <p className="text-xs text-rose-300 bg-rose-950/30 border border-rose-500/30 rounded-lg p-2">{error}</p>}

        <p className="text-[10px] text-slate-500 text-center leading-relaxed">
          The engineering worker proposes an artifact. It never receives user authority and cannot deploy without this approval boundary.
        </p>
      </div>
    </div>
  );
};
