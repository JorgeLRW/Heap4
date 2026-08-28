import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Send,
  Sparkles,
  Bot,
  User,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Clock,
  Cpu,
  RefreshCw,
  Play,
  Flame,
  Layers,
  ShoppingBag
} from 'lucide-react';
import { getWebMCP, WebMCPExportedTool } from '../webmcp';
import { AIProviderConfig } from '../../server/providers/llmGateway';

interface AgentMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  toolCalls?: Array<{
    toolName: string;
    parameters: Record<string, any>;
    explanation?: string;
    executionResult?: any;
  }>;
  modelUsed?: string;
  latencyMs?: number;
}

interface AgentPlaygroundProps {
  aiConfig: AIProviderConfig;
}

export const AgentPlayground: React.FC<AgentPlaygroundProps> = ({ aiConfig }) => {
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: 'msg_welcome',
      sender: 'agent',
      text: `Hello! I am your autonomous WebMCP Agent connected to the active browser tab. You can give me natural language instructions to inspect state, repair storage glitches, or reset workflows.`,
      timestamp: new Date().toISOString(),
      modelUsed: aiConfig.provider === 'ollama' ? `Ollama (${aiConfig.model || 'llama3.1'})` : aiConfig.provider === 'openai' ? `OpenAI (${aiConfig.model || 'gpt-4o'})` : 'Built-in Simulator Engine',
    },
  ]);
  const [inputText, setInputText] = useState<string>('');
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [tools, setTools] = useState<WebMCPExportedTool[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const refreshTools = () => {
    const { registry } = getWebMCP();
    setTools(registry.listTools());
  };

  useEffect(() => {
    refreshTools();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const handleSendMessage = async (textToSend?: string) => {
    const prompt = (textToSend || inputText).trim();
    if (!prompt || isThinking) return;

    setInputText('');
    const userMsgId = 'msg_' + Math.random().toString(36).substring(2, 9);
    const userMessage: AgentMessage = {
      id: userMsgId,
      sender: 'user',
      text: prompt,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsThinking(true);

    try {
      const { registry } = getWebMCP();
      const currentTools = registry.listTools();

      // Gather client context
      const clientContext = {
        url: window.location.href,
        localStorageKeys: Object.keys(localStorage),
        timestamp: new Date().toISOString(),
      };

      // Call Agent Chat API
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          availableTools: currentTools,
          clientContext,
          providerConfig: aiConfig,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const executedToolCalls: any[] = [];

      // Execute tool calls returned by agent in the active browser tab
      if (data.toolCalls && Array.isArray(data.toolCalls)) {
        for (const tc of data.toolCalls) {
          console.info(`%c[WebMCP Playground] Executing tool "${tc.toolName}"`, 'color: #10b981; font-weight: bold;');
          const execRes = await registry.executeTool(tc.toolName, tc.parameters || {});
          executedToolCalls.push({
            ...tc,
            executionResult: execRes,
          });
        }
      }

      const agentMessage: AgentMessage = {
        id: 'msg_' + Math.random().toString(36).substring(2, 9),
        sender: 'agent',
        text: data.response || 'Action completed.',
        timestamp: new Date().toISOString(),
        toolCalls: executedToolCalls,
        modelUsed: data.modelUsed,
        latencyMs: data.latencyMs,
      };

      setMessages((prev) => [...prev, agentMessage]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: 'msg_err_' + Math.random().toString(36).substring(2, 9),
          sender: 'agent',
          text: `Error contacting agent engine: ${err?.message || String(err)}. Falling back to local tools.`,
          timestamp: new Date().toISOString(),
          modelUsed: 'Error Fallback',
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  const quickPrompts = [
    { label: 'Inspect Session Diagnostics', prompt: 'Inspect my active session diagnostics and cart status.' },
    { label: 'Repair Corrupted Storage', prompt: 'Purge corrupted localStorage keys and rehydrate cart state.' },
    { label: 'Reset Checkout Wizard', prompt: 'Reset the checkout workflow state machine to the shipping step.' },
    { label: 'Sync Cloud Workspace', prompt: 'Trigger background synchronization for workspace entities.' },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 animate-fade-in flex flex-col h-[calc(100vh-140px)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="w-6 h-6 text-emerald-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Interactive WebMCP Console</h2>
            <span className="px-2 py-0.5 text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md">
              Live Agent
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Type natural language commands. The AI Agent inspects and executes <code className="text-emerald-400">window.webmcp</code> tools deterministically.
          </p>
        </div>

        {/* Model Indicator */}
        <div className="text-xs font-mono text-slate-300 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-2 self-start sm:self-center">
          <Cpu className="w-3.5 h-3.5 text-emerald-400" />
          <span>
            {aiConfig.provider === 'ollama'
              ? `Ollama: ${aiConfig.model || 'llama3.1'}`
              : aiConfig.provider === 'openai'
              ? `OpenAI: ${aiConfig.model || 'gpt-4o'}`
              : 'Built-in Engine'}
          </span>
        </div>
      </div>

      {/* Main Chat Feed */}
      <div className="flex-1 bg-slate-900/60 border border-slate-800/90 rounded-2xl p-5 overflow-y-auto space-y-4 backdrop-blur-sm">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';

          return (
            <div key={msg.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-slate-950 shrink-0 font-bold shadow-md shadow-emerald-950/50">
                  <Bot className="w-4 h-4 text-slate-950" />
                </div>
              )}

              <div className={`max-w-xl space-y-2 ${isUser ? 'items-end' : 'items-start'}`}>
                {/* Message Bubble */}
                <div
                  className={`p-4 rounded-2xl text-xs leading-relaxed ${
                    isUser
                      ? 'bg-emerald-600 text-white rounded-br-none shadow-md shadow-emerald-950/40'
                      : 'bg-slate-950/80 border border-slate-800 text-slate-200 rounded-bl-none shadow-lg'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>

                {/* Tool Invocations Box */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="p-3 bg-slate-950/90 border border-emerald-500/30 rounded-xl space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between text-[11px] text-emerald-400 font-bold">
                      <span className="flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5" /> WebMCP Tool Dispatched:
                      </span>
                      <span className="text-slate-500">{msg.latencyMs ? `${msg.latencyMs}ms` : ''}</span>
                    </div>

                    {msg.toolCalls.map((tc, idx) => (
                      <div key={idx} className="space-y-1 pt-1 border-t border-slate-800/80">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-300 font-semibold">{tc.toolName}()</span>
                          {tc.executionResult?.status === 'success' ? (
                            <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded font-sans">
                              Success
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.2 bg-rose-500/20 text-rose-300 rounded font-sans">
                              Error
                            </span>
                          )}
                        </div>

                        {tc.explanation && <p className="text-[11px] text-slate-400 font-sans">{tc.explanation}</p>}

                        <pre className="p-2 bg-slate-900 rounded text-[11px] text-slate-300 overflow-x-auto">
                          {JSON.stringify(tc.parameters, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}

                {/* Message Meta */}
                <div className="flex items-center gap-2 text-[10px] text-slate-500 px-1">
                  <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {msg.modelUsed && <span>• {msg.modelUsed}</span>}
                </div>
              </div>

              {isUser && (
                <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {isThinking && (
          <div className="flex gap-3 justify-start items-center animate-pulse">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <RefreshCw className="w-4 h-4 animate-spin" />
            </div>
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl text-xs text-slate-400 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Analyzing intent & preparing WebMCP tool call...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts & Input Bar */}
      <div className="space-y-3 shrink-0">
        {/* Quick Prompts */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          {quickPrompts.map((qp, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(qp.prompt)}
              disabled={isThinking}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-xl transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5"
            >
              <Sparkles className="w-3 h-3 text-emerald-400" />
              {qp.label}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="flex gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-2 focus-within:border-emerald-500/60 transition-all shadow-lg">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendMessage();
            }}
            placeholder="Type a command (e.g., 'Inspect my cart and fix corrupted cache')..."
            disabled={isThinking}
            className="flex-1 bg-transparent px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={isThinking || !inputText.trim()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 shadow-md shadow-emerald-950/40"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </div>
      </div>
    </div>
  );
};
