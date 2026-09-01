import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleDashed, Cpu, FileCode2, FlaskConical, ShieldCheck, Terminal, Wrench, X } from 'lucide-react';
import { intentRuntime } from '../client/heap/intentRuntime';
import type { RepairJob } from '../shared/demoApiTypes';

interface DeveloperRepairPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const stageLabels: Record<RepairJob['currentStage'], string> = {
  failure_captured: 'Failure captured',
  sandbox_created: 'Sandbox created',
  reproduction_confirmed: 'Reproducer confirmed',
  patch_generated: 'Patch generated',
  validation_complete: 'Validation complete',
  deployment_verified: 'Deployment verified',
};

export const DeveloperRepairPanel: React.FC<DeveloperRepairPanelProps> = ({ isOpen, onClose }) => {
  const [currentBuild, setCurrentBuild] = useState(intentRuntime.getCurrentBuild());
  const [repairJob, setRepairJob] = useState<RepairJob | null>(intentRuntime.getRepairJob());
  const [working, setWorking] = useState<'refreshing' | 'deploying' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      setCurrentBuild(intentRuntime.getCurrentBuild());
      setRepairJob(intentRuntime.getRepairJob());
    };
    update();
    return intentRuntime.subscribe(update);
  }, []);

  const checks = useMemo(() => repairJob?.artifact.validationChecks || [], [repairJob]);
  const isReady = repairJob?.status === 'ready_for_review';
  const isDeployed = repairJob?.status === 'approved_and_deployed';
  const execution = repairJob?.sandbox.execution;

  if (!isOpen) return null;

  const refreshRepair = async () => {
    setWorking('refreshing');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 text-slate-100">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-[#0d121f] border border-slate-700/80 rounded-2xl shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
            <Wrench className="w-4 h-4" />
            <span>ENGINEERING REPAIR PIPELINE</span>
          </div>
          <button onClick={onClose} aria-label="Close engineering panel" className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <span className="text-slate-500 block mb-1">Active release</span>
            <span className={isDeployed ? 'font-mono text-emerald-400' : 'font-mono text-amber-300'}>{currentBuild}</span>
          </div>
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <span className="text-slate-500 block mb-1">Repair class</span>
            <span className="font-mono text-white">bounded provider adapter</span>
          </div>
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
            <span className="text-slate-500 block mb-1">Workspace</span>
            <span className="font-mono text-emerald-300">
              {execution?.mode === 'cloudflare_vm'
                ? 'isolated VM'
                : execution?.mode === 'edge_deterministic'
                  ? 'edge evidence runner'
                : execution?.mode === 'local_bounded_process'
                  ? 'bounded local process'
                  : 'awaiting executor'}
            </span>
          </div>
        </div>

        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1.5">
          <span className="text-slate-500 uppercase tracking-wider text-[10px] font-bold">Correlated failure</span>
          <div className="font-mono text-rose-300">DeliveryService.ts:42 · DELIVERY_PROVIDER_CONFIGURATION_ERROR</div>
          <div className="text-slate-400">The invoice is already persisted. The repair may only change delivery behavior and must preserve the no-duplicate invariant.</div>
        </div>

        {!repairJob && (
          <button
            onClick={refreshRepair}
            disabled={working !== null}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <Cpu className="w-4 h-4" />
            {working === 'refreshing' ? 'Starting repair worker…' : 'Start scoped repair worker'}
          </button>
        )}

        {repairJob && (
          <div className="space-y-4">
            <div className="p-4 bg-indigo-950/20 border border-indigo-500/30 rounded-xl space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono font-bold text-indigo-300 text-sm">{repairJob.id}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">Automatically started from the failure capsule</div>
                </div>
                <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${
                  isDeployed ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' :
                  isReady ? 'text-indigo-300 border-indigo-500/30 bg-indigo-500/10' :
                  'text-amber-300 border-amber-500/30 bg-amber-500/10'
                }`}>
                  {repairJob.status.replaceAll('_', ' ')}
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed text-xs">{repairJob.diagnosis}</p>
              <div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                  <span>{stageLabels[repairJob.currentStage]}</span>
                  <span>{repairJob.stageProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-900 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500" style={{ width: `${repairJob.stageProgress}%` }} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-300 font-semibold"><FlaskConical className="w-3.5 h-3.5 text-cyan-400" /> {execution?.mode === 'edge_deterministic' ? 'Edge verifier scope' : 'Sandbox scope'}</div>
                <div className="text-slate-500">{repairJob.sandbox.instanceClass} · {repairJob.sandbox.sourceRevision}</div>
                <div className="font-mono text-slate-400 break-all">{repairJob.sandbox.workspace}</div>
                <div className="text-slate-400">{repairJob.sandbox.fileScope.length} writable files · {repairJob.sandbox.validationScope.length} validation targets</div>
                <div className="text-emerald-400">
                  {execution?.mode === 'cloudflare_vm'
                    ? 'Public internet disabled · no credentials in VM'
                    : execution?.mode === 'edge_deterministic'
                      ? 'Allowlisted deterministic checks · no container or credentials'
                    : 'Fixed argv only · reduced environment · no inherited secrets'}
                </div>
                <div className="text-slate-500">
                  Lifecycle: {execution?.lifecycle.replaceAll('_', ' ') || 'pending'}
                </div>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-300 font-semibold"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Change boundary</div>
                <div className="text-slate-400">Base: <span className="font-mono text-white">{repairJob.artifact.baseRevision}</span></div>
                <div className="text-slate-400">{repairJob.artifact.diffStat}</div>
                <div className="text-slate-400">{repairJob.artifact.file}</div>
                <div className="text-amber-300">Risk: {repairJob.riskClass.replaceAll('_', ' ')}</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Validation envelope</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {checks.map((check) => (
                  <div key={check.id} className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg flex items-start gap-2">
                    {check.status === 'passed' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <CircleDashed className={`w-4 h-4 shrink-0 ${check.status === 'running' ? 'text-amber-400 animate-spin' : 'text-slate-600'}`} />}
                    <div>
                      <div className={check.status === 'passed' ? 'text-emerald-300 text-xs' : 'text-slate-300 text-xs'}>{check.label}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{check.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Agent decisions</div>
                {(repairJob.agent.events || []).map((event, index) => (
                  <div key={`${event.timestamp}-${index}`} className="border-l border-indigo-500/40 pl-3 py-1">
                    <div className="text-[10px] uppercase tracking-wider text-indigo-300">{event.stage}</div>
                    <div className="text-[11px] text-slate-300 mt-0.5">{event.message}</div>
                    {event.evidenceId && (
                      <div className="font-mono text-[9px] text-slate-600 mt-1">evidence {event.evidenceId.slice(0, 16)}</div>
                    )}
                  </div>
                ))}
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{execution?.mode === 'edge_deterministic' ? 'Validation evidence' : 'Executable evidence'}</div>
                {!execution?.commands.length && (
                  <div className="text-[11px] text-slate-500">Waiting for the sandbox to emit command results.</div>
                )}
                {execution?.commands.map((command) => (
                  <details key={command.digest} className="group rounded-lg border border-slate-800 bg-slate-900/60">
                    <summary className="cursor-pointer list-none p-2 flex items-center gap-2 text-[11px]">
                      <Terminal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="text-slate-300 flex-1">{command.label}</span>
                      <span className={command.exitCode === 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        exit {command.exitCode}
                      </span>
                    </summary>
                    <div className="border-t border-slate-800 p-2 space-y-2">
                      <div className="font-mono text-[9px] text-slate-500 break-all">$ {command.argv.join(' ')}</div>
                      {command.stdout && (
                        <pre className="text-[9px] text-emerald-300 whitespace-pre-wrap break-words">{command.stdout}</pre>
                      )}
                      {command.stderr && (
                        <pre className="text-[9px] text-rose-300 whitespace-pre-wrap break-words">{command.stderr}</pre>
                      )}
                      <div className="font-mono text-[9px] text-slate-600">sha256 {command.digest}</div>
                    </div>
                  </details>
                ))}
                {execution?.attemptedWrites.length ? (
                  <div className="text-[10px] text-slate-500">
                    Agent write set: <span className="font-mono text-slate-300">{execution.attemptedWrites.join(', ')}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <div className="px-3 py-2 bg-slate-900 flex items-center gap-2 text-xs text-slate-300">
                <FileCode2 className="w-4 h-4 text-emerald-400" />
                <span className="font-mono">{repairJob.artifact.file}</span>
              </div>
              <pre className="p-3 bg-slate-950 text-[11px] leading-relaxed text-emerald-200 overflow-x-auto whitespace-pre-wrap">{repairJob.artifact.patch}</pre>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-1">
              <span className="text-slate-500 block mb-1">Reproduction</span>
              <p className="text-slate-300">{repairJob.artifact.reproduction}</p>
              <p className="text-slate-400">{repairJob.artifact.regressionTest}</p>
            </div>

            {isReady && (
              <div className="space-y-2">
                <button
                  onClick={deployRepair}
                  disabled={working !== null}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {working === 'deploying' ? 'Promoting validated candidate…' : 'Approve validated candidate and promote'}
                </button>
                <p className="text-[10px] text-amber-300/80 text-center">
                  Human-only action. No registered WebMCP tool can promote a build, so the agent cannot reach this even if it asks.
                </p>
              </div>
            )}

            {isDeployed && repairJob.deploymentEvidence && (
              <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-xs space-y-1">
                <div className="text-emerald-300 font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Candidate verified and resumable</div>
                <div className="text-slate-400">{repairJob.deploymentEvidence.environment} · smoke test {repairJob.deploymentEvidence.smokeTest} · canary {repairJob.deploymentEvidence.canary}</div>
                <div className="text-slate-500">Rollback ready: {repairJob.deploymentEvidence.rollbackReady ? 'yes' : 'no'}</div>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-xs text-rose-300 bg-rose-950/30 border border-rose-500/30 rounded-lg p-2">{error}</p>}

        <p className="text-[10px] text-slate-500 text-center leading-relaxed">
          The repair worker can investigate and prepare an artifact immediately. Only a validated candidate may cross the delivery boundary, and only the unfinished user step may resume.
        </p>
      </div>
    </div>
  );
};
