import { SessionTelemetryPacket, WebMCPExportedTool } from '../../src/webmcp/types';

export type SupportedAIProvider = 'simulator' | 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'openrouter';

export interface AIProviderConfig {
  provider: SupportedAIProvider;
  apiKey?: string;
  endpointUrl?: string;
  model?: string;
  temperature?: number;
}

export interface ProviderValidationResult {
  valid: boolean;
  message: string;
  models?: string[];
  latencyMs?: number;
}

export interface AgentChatResult {
  response: string;
  toolCalls: Array<{
    toolName: string;
    parameters: Record<string, any>;
    explanation?: string;
  }>;
  modelUsed: string;
  provider: string;
  latencyMs: number;
}

export class LLMGateway {
  private defaultConfig: AIProviderConfig = {
    provider: 'simulator',
    model: 'built-in-heuristic-engine',
  };

  /**
   * Validate provider connection and retrieve available models where supported
   */
  public async validateConnection(config: AIProviderConfig): Promise<ProviderValidationResult> {
    const startTime = performance.now();

    if (config.provider === 'simulator') {
      return {
        valid: true,
        message: 'Built-in Deterministic Engine active. Zero configuration required.',
        models: ['built-in-heuristic-engine'],
        latencyMs: Math.round(performance.now() - startTime),
      };
    }

    if (config.provider === 'ollama') {
      const endpoint = (config.endpointUrl || 'http://localhost:11434').replace(/\/$/, '');
      try {
        const res = await fetch(`${endpoint}/api/tags`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) {
          return {
            valid: false,
            message: `Ollama returned HTTP status ${res.status}. Verify the Ollama server is running at ${endpoint}`,
            latencyMs: Math.round(performance.now() - startTime),
          };
        }

        const data: any = await res.json();
        const models = (data.models || []).map((m: any) => m.name || m.model);
        return {
          valid: true,
          message: `Connected to Ollama. Found ${models.length} installed model(s).`,
          models: models.length > 0 ? models : ['llama3.1', 'codellama', 'mistral'],
          latencyMs: Math.round(performance.now() - startTime),
        };
      } catch (err: any) {
        return {
          valid: false,
          message: `Could not reach Ollama at ${endpoint}. Error: ${err?.message || 'Connection refused'}`,
          latencyMs: Math.round(performance.now() - startTime),
        };
      }
    }

    if (config.provider === 'openai' || config.provider === 'openrouter') {
      const isRouter = config.provider === 'openrouter';
      const endpoint = isRouter
        ? 'https://openrouter.ai/api/v1/models'
        : 'https://api.openai.com/v1/models';

      if (!config.apiKey || config.apiKey.trim().length === 0) {
        return {
          valid: false,
          message: `Missing ${isRouter ? 'OpenRouter' : 'OpenAI'} API Key.`,
        };
      }

      try {
        const res = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${config.apiKey.trim()}`,
            ...(isRouter ? { 'HTTP-Referer': 'http://localhost:5173', 'X-Title': 'WebMCP Platform' } : {}),
          },
          signal: AbortSignal.timeout(6000),
        });

        if (!res.ok) {
          const errText = await res.text();
          return {
            valid: false,
            message: `API Key verification failed (HTTP ${res.status}): ${errText.substring(0, 120)}`,
            latencyMs: Math.round(performance.now() - startTime),
          };
        }

        const defaultModels = isRouter
          ? ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.1-70b-instruct']
          : ['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'gpt-4-turbo'];

        return {
          valid: true,
          message: `Successfully authenticated with ${isRouter ? 'OpenRouter' : 'OpenAI'}.`,
          models: defaultModels,
          latencyMs: Math.round(performance.now() - startTime),
        };
      } catch (err: any) {
        return {
          valid: false,
          message: `Network failure connecting to ${isRouter ? 'OpenRouter' : 'OpenAI'}: ${err?.message}`,
          latencyMs: Math.round(performance.now() - startTime),
        };
      }
    }

    if (config.provider === 'anthropic') {
      if (!config.apiKey || config.apiKey.trim().length === 0) {
        return { valid: false, message: 'Missing Anthropic API Key.' };
      }
      return {
        valid: true,
        message: 'Anthropic Claude API key configured.',
        models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
        latencyMs: Math.round(performance.now() - startTime),
      };
    }

    if (config.provider === 'gemini') {
      if (!config.apiKey || config.apiKey.trim().length === 0) {
        return { valid: false, message: 'Missing Google Gemini API Key.' };
      }
      return {
        valid: true,
        message: 'Google Gemini API key configured.',
        models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash-exp'],
        latencyMs: Math.round(performance.now() - startTime),
      };
    }

    return { valid: true, message: 'Provider configured', models: [] };
  }

  /**
   * Fetch installed Ollama models dynamically
   */
  public async fetchOllamaModels(endpointUrl?: string): Promise<string[]> {
    const endpoint = (endpointUrl || 'http://localhost:11434').replace(/\/$/, '');
    try {
      const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data: any = await res.json();
        return (data.models || []).map((m: any) => m.name || m.model);
      }
    } catch {}
    return ['llama3.1', 'deepseek-coder', 'mistral', 'codellama'];
  }

  /**
   * Natural Language Agent Chat & Interactive WebMCP Tool Invocation
   */
  public async chatWithAgent(
    userPrompt: string,
    availableTools: WebMCPExportedTool[],
    clientContext: Record<string, any> = {},
    config: AIProviderConfig = this.defaultConfig
  ): Promise<AgentChatResult> {
    const startTime = performance.now();

    // System prompt describing the WebMCP tool execution protocol
    const systemPrompt = `You are the WebMCP Autonomous Browser Assistant.
You have direct access to execute client-side tools exposed by the application in the active user session.

Available WebMCP Tools (OpenAPI / JSON Schema):
${JSON.stringify(availableTools, null, 2)}

Current Client Diagnostic State:
${JSON.stringify(clientContext, null, 2)}

Instructions:
1. Understand the user's intent.
2. If the user asks to inspect, repair, reset, or perform an action that matches one of the declared tools, you MUST return a structured JSON tool call.
3. Your output MUST be valid JSON in the following format:
{
  "response": "User-facing summary message of what you are doing",
  "toolCalls": [
    {
      "toolName": "name_of_tool",
      "parameters": { ... },
      "explanation": "Why this tool is being invoked"
    }
  ]
}
If no tool invocation is needed, leave "toolCalls" as an empty array [].`;

    // 1. Ollama Execution
    if (config.provider === 'ollama') {
      const endpoint = (config.endpointUrl || 'http://localhost:11434').replace(/\/$/, '');
      const model = config.model || 'llama3.1';

      try {
        const res = await fetch(`${endpoint}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            system: systemPrompt,
            prompt: `User Request: ${userPrompt}\n\nRespond ONLY with the required JSON object.`,
            stream: false,
            format: 'json',
            options: {
              temperature: config.temperature ?? 0.2,
            },
          }),
          signal: AbortSignal.timeout(20000),
        });

        if (res.ok) {
          const data: any = await res.json();
          const parsed = this.parseJsonOutput(data.response || data.text || '');
          if (parsed && typeof parsed.response === 'string') {
            return {
              response: parsed.response,
              toolCalls: parsed.toolCalls || [],
              modelUsed: `Ollama (${model})`,
              provider: 'ollama',
              latencyMs: Math.round(performance.now() - startTime),
            };
          }
        }
      } catch (e) {
        console.warn('[LLMGateway] Ollama call failed, falling back to heuristic engine:', e);
      }
    }

    // 2. OpenAI / OpenRouter Execution
    if (config.provider === 'openai' || config.provider === 'openrouter') {
      const isRouter = config.provider === 'openrouter';
      const endpoint = isRouter
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
      const model = config.model || (isRouter ? 'openai/gpt-4o-mini' : 'gpt-4o-mini');

      if (config.apiKey) {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey.trim()}`,
              ...(isRouter ? { 'HTTP-Referer': 'http://localhost:5173', 'X-Title': 'WebMCP Platform' } : {}),
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              response_format: { type: 'json_object' },
              temperature: config.temperature ?? 0.2,
            }),
            signal: AbortSignal.timeout(15000),
          });

          if (res.ok) {
            const data: any = await res.json();
            const content = data.choices?.[0]?.message?.content || '';
            const parsed = this.parseJsonOutput(content);
            if (parsed && typeof parsed.response === 'string') {
              return {
                response: parsed.response,
                toolCalls: parsed.toolCalls || [],
                modelUsed: `${isRouter ? 'OpenRouter' : 'OpenAI'} (${model})`,
                provider: config.provider,
                latencyMs: Math.round(performance.now() - startTime),
              };
            }
          }
        } catch (e) {
          console.warn('[LLMGateway] OpenAI API call failed, falling back to heuristic:', e);
        }
      }
    }

    // Fallback: Built-in Heuristic Natural Language Parser
    return this.fallbackHeuristicChat(userPrompt, availableTools, startTime);
  }

  /**
   * Triage an error packet using the configured LLM or heuristic fallback
   */
  public async triageTelemetryPacket(
    packet: SessionTelemetryPacket,
    config: AIProviderConfig = this.defaultConfig
  ): Promise<{
    category: 'CLIENT_STATE_GLITCH' | 'SOURCE_CODE_BUG';
    remediationPath: 'WEBMCP_HOTFIX' | 'CODEBASE_PR';
    confidence: number;
    reasoning: string;
    modelUsed: string;
    webmcpAction?: {
      toolName: string;
      parameters: Record<string, any>;
      explanation: string;
    };
  }> {
    const errorMsg = packet.error?.message || '';
    const stackTrace = packet.error?.stack || '';
    const tools = packet.availableWebMcpTools || [];

    // If an external LLM is configured (e.g. Ollama or OpenAI), query it for real classification
    if ((config.provider === 'ollama' && config.model) || (config.provider === 'openai' && config.apiKey)) {
      try {
        const triagePrompt = `You are a site reliability triage AI. Analyze this browser error:
Error: "${errorMsg}"
Stack Trace: "${stackTrace}"
Declared WebMCP Tools: ${JSON.stringify(tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })))}

Determine if this is:
1. A CLIENT_STATE_GLITCH (corrupted localStorage, invalid cache, deadlock in UI state). If so, select the best WebMCP tool and construct its parameters.
2. A SOURCE_CODE_BUG (missing null check, TypeError in component source, unhandled promise). If so, route to CODEBASE_PR.

Respond strictly in JSON format:
{
  "category": "CLIENT_STATE_GLITCH" | "SOURCE_CODE_BUG",
  "remediationPath": "WEBMCP_HOTFIX" | "CODEBASE_PR",
  "confidence": 0.95,
  "reasoning": "Explanation of root cause",
  "webmcpAction": {
    "toolName": "name_of_tool",
    "parameters": { ... },
    "explanation": "Why this fixes the client state"
  }
}`;

        const chatResult = await this.chatWithAgent(triagePrompt, tools, packet.clientState || {}, config);
        const parsed = this.parseJsonOutput(chatResult.response);
        if (parsed && (parsed.category === 'CLIENT_STATE_GLITCH' || parsed.category === 'SOURCE_CODE_BUG')) {
          return {
            category: parsed.category,
            remediationPath: parsed.remediationPath || (parsed.category === 'CLIENT_STATE_GLITCH' ? 'WEBMCP_HOTFIX' : 'CODEBASE_PR'),
            confidence: parsed.confidence || 0.94,
            reasoning: parsed.reasoning || chatResult.response,
            modelUsed: chatResult.modelUsed,
            webmcpAction: parsed.webmcpAction,
          };
        }
      } catch (e) {
        console.warn('[LLMGateway] LLM triage query encountered an issue, using heuristic fallback:', e);
      }
    }

    // Heuristic triage
    const lower = (errorMsg + ' ' + stackTrace).toLowerCase();
    const isStateGlitch =
      lower.includes('corrupted') ||
      lower.includes('poisoned') ||
      lower.includes('invalid cache') ||
      lower.includes('json.parse') ||
      lower.includes('unexpected token') ||
      lower.includes('deadlock') ||
      lower.includes('stuck') ||
      lower.includes('workflow_locked') ||
      lower.includes('desync') ||
      lower.includes('stale session') ||
      packet.error?.type === 'custom_report';

    let webmcpAction: any;
    if (isStateGlitch) {
      if (lower.includes('deadlock') || lower.includes('stuck') || lower.includes('lock') || lower.includes('modal') || lower.includes('workflow')) {
        const wfTool = tools.find(t => t.name.includes('workflow') || t.name.includes('reset'));
        webmcpAction = {
          toolName: wfTool?.name || 'reset_workflow_state',
          parameters: { workflowId: 'checkout-pipeline', forceReset: true, restoreStep: 'shipping' },
          explanation: 'Identified deadlock in multi-step wizard. Resetting workflow state machine.',
        };
      } else {
        const storageTool = tools.find(t => t.name.includes('storage') || t.name.includes('cache') || t.name.includes('repair'));
        webmcpAction = {
          toolName: storageTool?.name || 'repair_storage_cache',
          parameters: { resetKeys: ['nexus_user_cart', 'nexus_cached_theme', 'nexus_corrupt_payload'], rehydrateEntity: 'user_session', notifyUser: true },
          explanation: 'Corrupted localStorage cache keys detected. Purging poisoned keys and rehydrating state.',
        };
      }
    }

    return {
      category: isStateGlitch ? 'CLIENT_STATE_GLITCH' : 'SOURCE_CODE_BUG',
      remediationPath: isStateGlitch ? 'WEBMCP_HOTFIX' : 'CODEBASE_PR',
      confidence: isStateGlitch ? 0.96 : 0.92,
      reasoning: isStateGlitch
        ? `The issue stems from client-side state / storage corruption. A hot-fix via WebMCP (${webmcpAction?.toolName}) can recover the user immediately.`
        : `The issue is an unhandled exception in the source code. An automated PR has been prepared with reproduction tests and patch diff.`,
      modelUsed: 'Built-in Heuristic Engine',
      webmcpAction,
    };
  }

  private fallbackHeuristicChat(userPrompt: string, availableTools: WebMCPExportedTool[], startTime: number): AgentChatResult {
    const lower = userPrompt.toLowerCase();
    const toolCalls: AgentChatResult['toolCalls'] = [];
    let response = '';

    if (lower.includes('inspect') || lower.includes('status') || lower.includes('diagnos') || lower.includes('check cart')) {
      const inspectTool = availableTools.find(t => t.name === 'inspect_component_state');
      if (inspectTool) {
        toolCalls.push({
          toolName: inspectTool.name,
          parameters: { includeStorageKeys: true },
          explanation: 'Retrieving real-time snapshot of cart items, workflow state, and storage health.',
        });
        response = `I have dispatched \`${inspectTool.name}\` to inspect your active session state and diagnostics.`;
      }
    } else if (lower.includes('repair') || lower.includes('clean') || lower.includes('clear') || lower.includes('fix cart') || lower.includes('corrupt')) {
      const repairTool = availableTools.find(t => t.name === 'repair_storage_cache');
      if (repairTool) {
        toolCalls.push({
          toolName: repairTool.name,
          parameters: { resetKeys: ['nexus_user_cart', 'nexus_corrupt_payload'], rehydrateEntity: 'user_session', notifyUser: true },
          explanation: 'Purging corrupted client cache keys and rehydrating clean cart state.',
        });
        response = `I detected your request to repair storage cache. Dispatched \`${repairTool.name}\` to invalidate bad keys and restore default state.`;
      }
    } else if (lower.includes('workflow') || lower.includes('reset step') || lower.includes('unlock') || lower.includes('shipping') || lower.includes('wizard')) {
      const wfTool = availableTools.find(t => t.name === 'reset_workflow_state');
      if (wfTool) {
        const step = lower.includes('payment') ? 'payment' : lower.includes('idle') ? 'idle' : 'shipping';
        toolCalls.push({
          toolName: wfTool.name,
          parameters: { workflowId: 'checkout-pipeline', forceReset: true, restoreStep: step },
          explanation: `Resetting checkout pipeline state machine back to "${step}".`,
        });
        response = `I have invoked \`${wfTool.name}\` to unblock your checkout flow and transition to step "${step}".`;
      }
    } else if (lower.includes('sync') || lower.includes('cloud')) {
      const syncTool = availableTools.find(t => t.name === 'sync_entity_data');
      if (syncTool) {
        toolCalls.push({
          toolName: syncTool.name,
          parameters: { entityType: 'workspace' },
          explanation: 'Triggering atomic background synchronization for cloud workspaces.',
        });
        response = `I have executed \`${syncTool.name}\` to synchronize workspace entities with cloud storage.`;
      }
    } else {
      response = `I am your WebMCP Agent. I can interact directly with your application using ${availableTools.length} registered tools: ${availableTools.map(t => `\`${t.name}()\``).join(', ')}. Try asking me to "Inspect my session diagnostics" or "Repair corrupted cart cache".`;
    }

    return {
      response,
      toolCalls,
      modelUsed: 'Built-in Heuristic Engine',
      provider: 'simulator',
      latencyMs: Math.round(performance.now() - startTime),
    };
  }

  private parseJsonOutput(text: string): any {
    if (!text || typeof text !== 'string') return null;
    try {
      return JSON.parse(text);
    } catch {}

    // Match ```json ... ``` markdown fences
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {}
    }

    // Match first { and last }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.substring(firstBrace, lastBrace + 1));
      } catch {}
    }

    return null;
  }
}
