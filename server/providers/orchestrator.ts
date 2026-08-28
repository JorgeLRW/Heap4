import { LLMGateway, AIProviderConfig } from './llmGateway';
import { SessionTelemetryPacket, WebMCPExportedTool } from '../../src/webmcp/types';

export interface ModelNodeConfig {
  provider: 'simulator' | 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'openrouter';
  model: string;
  roleDescription: string;
}

export interface OrchestratorConfig {
  mode: 'supervisor' | 'uniform';
  supervisor: ModelNodeConfig;
  stateWorker: ModelNodeConfig;
  codeWorker: ModelNodeConfig;
  uniform: ModelNodeConfig;
}

export interface OrchestratorTriageOutput {
  category: 'CLIENT_STATE_GLITCH' | 'SOURCE_CODE_BUG';
  remediationPath: 'WEBMCP_HOTFIX' | 'CODEBASE_PR';
  confidence: number;
  reasoning: string;
  assignedModelChain: string;
  supervisorDecision?: string;
  webmcpAction?: {
    toolName: string;
    parameters: Record<string, any>;
    explanation: string;
  };
}

export class OrchestratorService {
  private llmGateway: LLMGateway;
  private config: OrchestratorConfig = {
    mode: 'supervisor',
    supervisor: {
      provider: 'openai',
      model: 'gpt-4o',
      roleDescription: 'Meta-Model: High-level reasoning, intent classification & worker assignment',
    },
    stateWorker: {
      provider: 'ollama',
      model: 'llama3.1',
      roleDescription: 'State Specialist: Fast client-side cache & workflow hot-fixes',
    },
    codeWorker: {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      roleDescription: 'Code Specialist: Deep unit testing, patch diff synthesis & PR creation',
    },
    uniform: {
      provider: 'simulator',
      model: 'built-in-heuristic-engine',
      roleDescription: 'Single Uniform Engine: Handles all triage & code tasks',
    },
  };

  constructor(llmGateway?: LLMGateway) {
    this.llmGateway = llmGateway || new LLMGateway();
  }

  public getConfig(): OrchestratorConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<OrchestratorConfig>): OrchestratorConfig {
    this.config = {
      ...this.config,
      ...newConfig,
      supervisor: { ...this.config.supervisor, ...(newConfig.supervisor || {}) },
      stateWorker: { ...this.config.stateWorker, ...(newConfig.stateWorker || {}) },
      codeWorker: { ...this.config.codeWorker, ...(newConfig.codeWorker || {}) },
      uniform: { ...this.config.uniform, ...(newConfig.uniform || {}) },
    };
    return this.config;
  }

  /**
   * Execute multi-model triage orchestration
   */
  public async orchestrateTriage(
    packet: SessionTelemetryPacket,
    overrideConfig?: Partial<OrchestratorConfig>
  ): Promise<OrchestratorTriageOutput> {
    const effectiveConfig: OrchestratorConfig = {
      ...this.config,
      ...(overrideConfig || {}),
    };

    if (effectiveConfig.mode === 'uniform') {
      // Uniform Single Model Mode
      const uniformProviderConfig: AIProviderConfig = {
        provider: effectiveConfig.uniform.provider,
        model: effectiveConfig.uniform.model,
      };

      const result = await this.llmGateway.triageTelemetryPacket(packet, uniformProviderConfig);
      return {
        category: result.category,
        remediationPath: result.remediationPath,
        confidence: result.confidence,
        reasoning: result.reasoning,
        assignedModelChain: `Uniform Model: ${effectiveConfig.uniform.provider.toUpperCase()} (${effectiveConfig.uniform.model})`,
        webmcpAction: result.webmcpAction,
      };
    }

    // Supervisor-Worker Mode
    const supervisorProviderConfig: AIProviderConfig = {
      provider: effectiveConfig.supervisor.provider,
      model: effectiveConfig.supervisor.model,
    };

    // 1. Supervisor judges the issue
    const supervisorResult = await this.llmGateway.triageTelemetryPacket(packet, supervisorProviderConfig);
    const category = supervisorResult.category;
    const isStateGlitch = category === 'CLIENT_STATE_GLITCH';

    // 2. Assign to specialized worker
    const assignedWorker = isStateGlitch ? effectiveConfig.stateWorker : effectiveConfig.codeWorker;
    const workerProviderConfig: AIProviderConfig = {
      provider: assignedWorker.provider,
      model: assignedWorker.model,
    };

    const workerResult = await this.llmGateway.triageTelemetryPacket(packet, workerProviderConfig);

    const assignedModelChain = `Supervisor [${effectiveConfig.supervisor.provider.toUpperCase()}: ${effectiveConfig.supervisor.model}] ➔ ${
      isStateGlitch ? 'State Specialist' : 'Code Specialist'
    } [${assignedWorker.provider.toUpperCase()}: ${assignedWorker.model}]`;

    return {
      category,
      remediationPath: isStateGlitch ? 'WEBMCP_HOTFIX' : 'CODEBASE_PR',
      confidence: Math.max(supervisorResult.confidence, workerResult.confidence),
      reasoning: isStateGlitch
        ? `[Supervisor Assigned to State Worker]: ${workerResult.reasoning}`
        : `[Supervisor Assigned to Code Worker]: ${workerResult.reasoning}`,
      assignedModelChain,
      supervisorDecision: `Classified as ${category} ➔ Delegated to ${assignedWorker.roleDescription}`,
      webmcpAction: isStateGlitch ? (workerResult.webmcpAction || supervisorResult.webmcpAction) : undefined,
    };
  }
}
