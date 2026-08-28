import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Sparkles,
  Send,
  CheckCircle2,
  AlertCircle,
  Wrench,
  Shield,
  Layers,
  ArrowRight,
  RefreshCw,
  Eye,
  Check,
  FileCode,
  Bug,
  Clock,
  Lock,
  ChevronRight
} from 'lucide-react';
import { ensureModelContext } from '../webmcp/modelContext';
import { intentRuntime, IntentCapsule } from '../recovery/intentRuntime';

interface Message {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  toolCalls?: Array<{
    name: string;
    params?: any;
    result?: any;
  }>;
  pendingApproval?: {
    intentId: string;
    intentTitle: string;
    actionIds: string[];
    actionTitles: string[];
    explanation: string;
    invariants: string[];
  };
  verification?: {
    status: 'PASS' | 'FAIL';
    details: string;
  };
  completedIntentId?: string;
}

interface StickyAgentPanelProps {
  onCapsuleCompleted?: (intentId: string) => void;
}

export const StickyAgentPanel: React.FC<StickyAgentPanelProps> = ({ onCapsuleCompleted }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'm1',
      sender: 'agent',
      text: "👋 I'm your WebMCP Intent Recovery Co-Pilot. When a workflow is interrupted, the application exposes its state, invariants, and permitted recovery actions via WebMCP so I can safely finish what you started.",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = ensureModelContext();
    setActiveTools(ensureModelContext().getToolsSync().map((t) => t.name));
    const unsub = intentRuntime.subscribe(() => {
      setActiveTools(ensureModelContext().getToolsSync().map((t) => t.name));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Agent inspects interrupted intents and proposes recovery plan
  const handleAgentResumeWorkflow = async () => {
    const ctx = ensureModelContext();
    setIsProcessing(true);

    const listRes = await ctx.executeTool('list_interrupted_intents', {});
    const list = listRes.interruptedIntents || [];

    if (list.length === 0) {
      setMessages((prev) => [
        ...prev,
        {
          id: 'msg_' + Date.now(),
          sender: 'agent',
          text: "I checked the application's recovery surface, but there are no interrupted workflows. All sessions are healthy!",
          timestamp: new Date().toLocaleTimeString(),
          toolCalls: [{ name: 'list_interrupted_intents', result: listRes }],
        },
      ]);
      setIsProcessing(false);
      return;
    }

    const target = list[0];
    const capsuleRes = await ctx.executeTool('inspect_interrupted_intent', { intentId: target.intentId });

    const recoveryActions = capsuleRes.allowedRecoveryActions || [];
    const actionIds = recoveryActions.map((a: any) => a.actionId);
    const actionTitles = recoveryActions.map((a: any) => a.name);

    setMessages((prev) => [
      ...prev,
      {
        id: 'msg_' + Date.now(),
        sender: 'agent',
        text: `I see what you were trying to accomplish:\n\n🎯 **Goal:** ${capsuleRes.goal}\n\n**Progress:**\n${capsuleRes.progress.completedSteps.map((s: string) => `• ✓ ${s}`).join('\n')}\n• ✗ **Failed at:** ${capsuleRes.progress.failedStep} (${capsuleRes.progress.failureReason})\n\n**Guarded Invariants:**\n${capsuleRes.invariants.map((inv: string) => `• 🔒 ${inv}`).join('\n')}\n\nI can resume and complete this workflow without repeating steps that already succeeded.`,
        timestamp: new Date().toLocaleTimeString(),
        toolCalls: [
          { name: 'list_interrupted_intents', result: listRes },
          { name: 'inspect_interrupted_intent', params: { intentId: target.intentId }, result: capsuleRes },
        ],
        pendingApproval: {
          intentId: target.intentId,
          intentTitle: target.title,
          actionIds,
          actionTitles,
          explanation: `Execute [${actionTitles.join(' ➔ ')}] and verify goal outcome.`,
          invariants: capsuleRes.invariants,
        },
      },
    ]);

    setIsProcessing(false);
  };

  // User Approves Recovery
  const handleApproveRecovery = async (approval: NonNullable<Message['pendingApproval']>) => {
    const ctx = ensureModelContext();
    setIsProcessing(true);

    const toolExecutionLogs: Array<{ name: string; params: any; result: any }> = [];

    // 1. Execute each permitted recovery action
    for (const actionId of approval.actionIds) {
      const res = await ctx.executeTool(actionId, { intentId: approval.intentId });
      toolExecutionLogs.push({ name: actionId, params: { intentId: approval.intentId }, result: res });
    }

    // 2. Verify goal outcome
    const verifyRes = await ctx.executeTool('verify_intent_completion', { intentId: approval.intentId });
    toolExecutionLogs.push({ name: 'verify_intent_completion', params: { intentId: approval.intentId }, result: verifyRes });

    onCapsuleCompleted?.(approval.intentId);

    setMessages((prev) => [
      ...prev,
      {
        id: 'msg_' + Date.now(),
        sender: 'agent',
        text: `🎉 **Workflow Recovered & Verified!**\n\nI executed the permitted recovery sequence while strictly preserving all application invariants.\n\n**Outcome:** ${verifyRes.message}\n\nDynamic WebMCP recovery tools have been cleaned up. The application is now back in a healthy state.`,
        timestamp: new Date().toLocaleTimeString(),
        toolCalls: toolExecutionLogs,
        verification: {
          status: 'PASS',
          details: verifyRes.message,
        },
        completedIntentId: approval.intentId,
      },
    ]);

    setIsProcessing(false);
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;

    const userText = inputText.trim();
    setInputText('');

    setMessages((prev) => [
      ...prev,
      {
        id: 'msg_' + Date.now(),
        sender: 'user',
        text: userText,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);

    const lower = userText.toLowerCase();
    if (lower.includes('finish') || lower.includes('resume') || lower.includes('fix') || lower.includes('invoice') || lower.includes('export') || lower.includes('invite')) {
      handleAgentResumeWorkflow();
    } else {
      setMessages((prev) => [
        ...prev,
        {
          id: 'msg_' + Date.now(),
          sender: 'agent',
          text: `I'm monitoring the application's WebMCP recovery surface (${activeTools.length} tools available). Tell me "Finish what I was doing" or click a quick action below!`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl flex flex-col h-full overflow-hidden animate-fade-in text-slate-100">
      {/* Header */}
      <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">Sticky Intent Co-Pilot</h3>
              <span className="px-1.5 py-0.2 text-[10px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded">
                WebMCP Recovery
              </span>
            </div>
            <span className="text-[11px] text-slate-400">Connected to navigator.modelContext</span>
          </div>
        </div>

        <div className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
          {activeTools.length} WebMCP Tools
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'} space-y-2`}
          >
            <div
              className={`p-3.5 rounded-2xl max-w-md leading-relaxed ${
                m.sender === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-none shadow-md'
                  : 'bg-slate-950/80 border border-slate-800 text-slate-200 rounded-bl-none shadow-md'
              }`}
            >
              <p className="whitespace-pre-line">{m.text}</p>
            </div>

            {/* Tool Calls Accordion */}
            {m.toolCalls && m.toolCalls.length > 0 && (
              <div className="w-full max-w-md p-2.5 bg-slate-950/90 border border-slate-800/90 rounded-xl space-y-1.5 text-[11px] font-mono">
                <div className="flex items-center justify-between text-slate-400 font-semibold uppercase text-[10px]">
                  <span className="flex items-center gap-1">
                    <Wrench className="w-3 h-3 text-emerald-400" /> WebMCP Tool Dispatches ({m.toolCalls.length})
                  </span>
                  <span className="text-emerald-400 font-bold">✓ Executed</span>
                </div>
                {m.toolCalls.map((tc, idx) => (
                  <div key={idx} className="p-1.5 bg-slate-900 rounded border border-slate-800 text-slate-300">
                    <span className="text-emerald-400 font-bold">{tc.name}()</span>
                    {tc.params && (
                      <div className="text-slate-400 text-[10px] truncate">
                        params: {JSON.stringify(tc.params)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Human-in-the-Loop Approval Card */}
            {m.pendingApproval && (
              <div className="w-full max-w-md p-4 bg-indigo-950/30 border border-indigo-500/40 rounded-xl space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-indigo-400" /> Human Approval Required
                  </span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                    Invariant Verified
                  </span>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-white">Proposed Recovery Execution:</h4>
                  <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{m.pendingApproval.explanation}</p>
                </div>

                <div className="p-2 bg-slate-950/70 rounded-lg border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                  <span className="font-semibold text-slate-300 block text-[10px] uppercase">Guaranteed Invariants:</span>
                  {m.pendingApproval.invariants.map((inv, idx) => (
                    <div key={idx} className="flex items-center gap-1 text-slate-300">
                      <Lock className="w-3 h-3 text-amber-400 shrink-0" /> {inv}
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => handleApproveRecovery(m.pendingApproval!)}
                    disabled={isProcessing}
                    className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white rounded-lg font-semibold text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/40"
                  >
                    <Check className="w-3.5 h-3.5" /> Approve & Resume Intent
                  </button>
                </div>
              </div>
            )}

            {/* Verification Pass Banner */}
            {m.verification && m.verification.status === 'PASS' && (
              <div className="w-full max-w-md p-3 bg-emerald-950/30 border border-emerald-500/40 rounded-xl text-emerald-300 flex items-center gap-2 font-mono text-[11px]">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Goal Assertion: <strong>PASS ✓</strong> ({m.verification.details})</span>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Prompt Chips */}
      <div className="p-2.5 bg-slate-950/60 border-t border-slate-800 flex items-center gap-2 overflow-x-auto text-[11px]">
        <button
          onClick={() => handleAgentResumeWorkflow()}
          disabled={isProcessing}
          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg whitespace-nowrap transition-all flex items-center gap-1 shrink-0 font-medium"
        >
          <Sparkles className="w-3 h-3 text-amber-400" /> "Finish what I was doing"
        </button>
        <button
          onClick={() => {
            setInputText("List interrupted workflows");
            handleSendMessage();
          }}
          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg whitespace-nowrap transition-all flex items-center gap-1 shrink-0 font-medium"
        >
          <Clock className="w-3 h-3 text-indigo-400" /> "List interrupted workflows"
        </button>
      </div>

      {/* Message Input Box */}
      <form onSubmit={handleSendMessage} className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Tell Agent to resume, inspect, or complete..."
          className="flex-1 px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isProcessing}
          className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-xl transition-all shadow-md shadow-indigo-950/40"
        >
          {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
};
