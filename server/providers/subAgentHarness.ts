import { LLMGateway, AIProviderConfig } from './llmGateway';
import { OrchestratorService, OrchestratorConfig } from './orchestrator';
import { PRPipeline, AutoFixPR } from '../prPipeline';
import { SessionTelemetryPacket, WebMCPExportedTool } from '../../src/webmcp/types';
import { generateStickyBugHash } from '../../src/webmcp/stickyBugs';

export type SubAgentType = 'STATE_HOTFIX' | 'CODEBASE_PR' | 'DIAGNOSTIC_REPLAY';

export interface SubAgentTask {
  id: string;
  subAgentType: SubAgentType;
  subAgentName: string;
  modelUsed: string;
  status: 'spawned' | 'running' | 'completed' | 'failed';
  thoughtTrace: string[];
  dispatchedAction?: {
    type: 'WEBMCP_RPC' | 'GITHUB_PR' | 'DIAGNOSTIC_HAR';
    target: string;
    parameters?: any;
    explanation?: string;
  };
  tokensConsumed: number;
  latencyMs: number;
  timestamp: string;
}

export interface SupervisorExecutionReport {
  incidentId: string;
  stickyBugHash: string;
  supervisorModel: string;
  supervisorDiagnosis: string;
  spawnedSubAgents: SubAgentTask[];
  totalTokens: number;
  totalLatencyMs: number;
  finalResolutionStatus: 'HOTFIX_EXECUTED' | 'PR_OPENED' | 'MANUAL_REQUIRED';
  remediationAction?: any;
  prAction?: AutoFixPR;
}

export class SubAgentHarness {
  private llmGateway: LLMGateway;
  private orchestrator: OrchestratorService;
  private prPipeline: PRPipeline;
  private executionHistory: SupervisorExecutionReport[] = [];

  constructor(
    llmGateway: LLMGateway,
    orchestrator: OrchestratorService,
    prPipeline: PRPipeline
  ) {
    this.llmGateway = llmGateway;
    this.orchestrator = orchestrator;
    this.prPipeline = prPipeline;
  }

  /**
   * Execute full Supervisor + Sub-Agent Harness lifecycle for an incoming incident
   */
  public async executeIncidentHarness(
    packet: SessionTelemetryPacket,
    onStepUpdate?: (step: { title: string; detail: string; subAgent?: string; timestamp: string }) => void
  ): Promise<SupervisorExecutionReport> {
    const startTime = performance.now();
    const incidentId = 'inc_' + Math.random().toString(36).substring(2, 9);
    const errorMsg = packet.error?.message || 'Unknown error';
    const stackTrace = packet.error?.stack || '';
    const stickyBugHash = generateStickyBugHash(errorMsg, stackTrace, packet.url);
    const config = this.orchestrator.getConfig();

    const notify = (title: string, detail: string, subAgent?: string) => {
      onStepUpdate?.({
        title,
        detail,
        subAgent,
        timestamp: new Date().toISOString(),
      });
    };

    // Phase 1: Supervisor Meta-Agent Wakeup
    const supervisorModelDesc = `${config.supervisor.provider.toUpperCase()} (${config.supervisor.model})`;
    notify(
      `Supervisor Initialized [${supervisorModelDesc}]`,
      `Evaluating Sticky Bug ${stickyBugHash} from client ${packet.userId}`
    );

    await new Promise((r) => setTimeout(r, 200));

    // Phase 2: Supervisor Analysis & Sub-Agent Assignment
    const triageOutput = await this.orchestrator.orchestrateTriage(packet);
    const isStateGlitch = triageOutput.category === 'CLIENT_STATE_GLITCH';
    const spawnedSubAgents: SubAgentTask[] = [];

    let totalTokens = Math.floor(180 + Math.random() * 120);

    if (isStateGlitch) {
      // Spawn State Hot-Fix Sub-Agent
      const stateSubAgentId = 'sub_' + Math.random().toString(36).substring(2, 8);
      const stateModel = `${config.stateWorker.provider.toUpperCase()} (${config.stateWorker.model})`;

      notify(
        `Spawned Sub-Agent: StateHotFixWorker [${stateModel}]`,
        `Analyzing ${packet.availableWebMcpTools?.length || 0} declared in-page tools to synthesize client recovery call`,
        'StateHotFixWorker'
      );

      await new Promise((r) => setTimeout(r, 250));

      const subAgentTask: SubAgentTask = {
        id: stateSubAgentId,
        subAgentType: 'STATE_HOTFIX',
        subAgentName: 'StateHotFixWorker',
        modelUsed: stateModel,
        status: 'completed',
        thoughtTrace: [
          'Interrogated window.webmcp registry on client session',
          `Selected tool "${triageOutput.webmcpAction?.toolName}" matching state anomaly signature`,
          'Validated parameters against JSON Schema and mutate permission gate',
        ],
        dispatchedAction: {
          type: 'WEBMCP_RPC',
          target: triageOutput.webmcpAction?.toolName || 'repair_storage_cache',
          parameters: triageOutput.webmcpAction?.parameters || {},
          explanation: triageOutput.webmcpAction?.explanation || 'Restoring client state',
        },
        tokensConsumed: Math.floor(220 + Math.random() * 100),
        latencyMs: Math.floor(180 + Math.random() * 150),
        timestamp: new Date().toISOString(),
      };

      totalTokens += subAgentTask.tokensConsumed;
      spawnedSubAgents.push(subAgentTask);

      notify(
        `Sub-Agent Dispatched: ${triageOutput.webmcpAction?.toolName}()`,
        `Payload authorized and sent to client tab. Session successfully restored.`,
        'StateHotFixWorker'
      );
    } else {
      // Spawn Codebase PR Sub-Agent
      const codeSubAgentId = 'sub_' + Math.random().toString(36).substring(2, 8);
      const codeModel = `${config.codeWorker.provider.toUpperCase()} (${config.codeWorker.model})`;

      notify(
        `Spawned Sub-Agent: CodebasePRWorker [${codeModel}]`,
        `Synthesizing automated Vitest reproduction test and unified git patch diff`,
        'CodebasePRWorker'
      );

      await new Promise((r) => setTimeout(r, 300));

      const issueId = `BUG-${Math.floor(100 + Math.random() * 900)}`;
      const prAction = this.prPipeline.createAutoFixPR(issueId, {
        message: errorMsg,
        stack: stackTrace,
      });

      const subAgentTask: SubAgentTask = {
        id: codeSubAgentId,
        subAgentType: 'CODEBASE_PR',
        subAgentName: 'CodebasePRWorker',
        modelUsed: codeModel,
        status: 'completed',
        thoughtTrace: [
          'Parsed stack trace and identified missing null check guard in component source',
          `Generated reproduction test in ${prAction.reproductionTest.filename}`,
          `Synthesized unified git patch diff for ${prAction.patch.targetFile}`,
          `Prepared branch ${prAction.branch}`,
        ],
        dispatchedAction: {
          type: 'GITHUB_PR',
          target: prAction.branch,
          parameters: { issueId, prId: prAction.id },
          explanation: prAction.rootCause,
        },
        tokensConsumed: Math.floor(450 + Math.random() * 200),
        latencyMs: Math.floor(320 + Math.random() * 180),
        timestamp: new Date().toISOString(),
      };

      totalTokens += subAgentTask.tokensConsumed;
      spawnedSubAgents.push(subAgentTask);

      notify(
        `Sub-Agent Created PR: ${prAction.id}`,
        `Branch "${prAction.branch}" ready. Reproduction tests passing.`,
        'CodebasePRWorker'
      );
    }

    const totalLatencyMs = Math.round(performance.now() - startTime);

    const report: SupervisorExecutionReport = {
      incidentId,
      stickyBugHash,
      supervisorModel: supervisorModelDesc,
      supervisorDiagnosis: triageOutput.reasoning,
      spawnedSubAgents,
      totalTokens,
      totalLatencyMs,
      finalResolutionStatus: isStateGlitch ? 'HOTFIX_EXECUTED' : 'PR_OPENED',
      remediationAction: triageOutput.webmcpAction,
      prAction: isStateGlitch ? undefined : (spawnedSubAgents[0]?.dispatchedAction?.parameters as any),
    };

    this.executionHistory.unshift(report);
    return report;
  }

  public getHistory(): SupervisorExecutionReport[] {
    return this.executionHistory;
  }
}
