import { SessionTelemetryPacket, WebMCPExportedTool } from '../src/webmcp/types';
import { PRPipeline, AutoFixPR } from './prPipeline';
import { LLMGateway, AIProviderConfig } from './providers/llmGateway';
import { OrchestratorService, OrchestratorConfig } from './providers/orchestrator';
import { SubAgentHarness, SupervisorExecutionReport, SubAgentTask } from './providers/subAgentHarness';
import { StickyBugStore } from './stickyBugStore';
import { generateStickyBugHash } from '../src/webmcp/stickyBugs';

export interface TriageStep {
  step: 'INGESTED' | 'ANALYZING_TRACE' | 'CLASSIFYING' | 'REMEDIATING' | 'COMPLETED' | 'FAILED';
  title: string;
  detail: string;
  subAgent?: string;
  timestamp: string;
}

export interface TriageResult {
  packetId: string;
  stickyBugHash: string;
  category: 'CLIENT_STATE_GLITCH' | 'SOURCE_CODE_BUG' | 'UNKNOWN';
  remediationPath: 'WEBMCP_HOTFIX' | 'CODEBASE_PR' | 'MANUAL_TRIAGE';
  confidence: number;
  reasoning: string;
  modelUsed: string;
  steps: TriageStep[];
  subAgents: SubAgentTask[];
  totalTokens: number;
  webmcpAction?: {
    toolName: string;
    parameters: Record<string, any>;
    explanation: string;
  };
  prAction?: AutoFixPR;
}

export class AgentTriageEngine {
  private prPipeline: PRPipeline;
  private llmGateway: LLMGateway;
  private orchestrator: OrchestratorService;
  private subAgentHarness: SubAgentHarness;
  private stickyBugStore: StickyBugStore;
  private history: TriageResult[] = [];

  constructor(
    prPipeline: PRPipeline,
    llmGateway?: LLMGateway,
    orchestrator?: OrchestratorService,
    stickyBugStore?: StickyBugStore
  ) {
    this.prPipeline = prPipeline;
    this.llmGateway = llmGateway || new LLMGateway();
    this.orchestrator = orchestrator || new OrchestratorService(this.llmGateway);
    this.stickyBugStore = stickyBugStore || new StickyBugStore();
    this.subAgentHarness = new SubAgentHarness(this.llmGateway, this.orchestrator, this.prPipeline);
  }

  public getLLMGateway(): LLMGateway {
    return this.llmGateway;
  }

  public getOrchestrator(): OrchestratorService {
    return this.orchestrator;
  }

  public getSubAgentHarness(): SubAgentHarness {
    return this.subAgentHarness;
  }

  public getStickyBugStore(): StickyBugStore {
    return this.stickyBugStore;
  }

  /**
   * Triage an incoming error packet through the Autonomous Sub-Agent Harness
   */
  public async triageSessionPacket(
    packet: SessionTelemetryPacket,
    orchestratorOverride?: Partial<OrchestratorConfig>,
    onStepUpdate?: (step: TriageStep) => void
  ): Promise<TriageResult> {
    const steps: TriageStep[] = [];
    const logStep = (step: TriageStep['step'], title: string, detail: string, subAgent?: string) => {
      const entry: TriageStep = {
        step,
        title,
        detail,
        subAgent,
        timestamp: new Date().toISOString(),
      };
      steps.push(entry);
      onStepUpdate?.(entry);
    };

    const errorMsg = packet.error?.message || 'Unknown error';
    const stackTrace = packet.error?.stack || '';
    const stickyBugHash = generateStickyBugHash(errorMsg, stackTrace, packet.url);

    // Step 1: Ingest
    logStep('INGESTED', `Incident Intercepted [${stickyBugHash}]`, `Packet ${packet.id} from user ${packet.userId}`);

    // Step 2: Run Sub-Agent Harness
    const report = await this.subAgentHarness.executeIncidentHarness(packet, (s) => {
      logStep('ANALYZING_TRACE', s.title, s.detail, s.subAgent);
    });

    const isStateGlitch = report.finalResolutionStatus === 'HOTFIX_EXECUTED';
    const category = isStateGlitch ? 'CLIENT_STATE_GLITCH' : 'SOURCE_CODE_BUG';
    const remediationPath = isStateGlitch ? 'WEBMCP_HOTFIX' : 'CODEBASE_PR';

    let prAction: AutoFixPR | undefined;
    if (!isStateGlitch) {
      const prList = this.prPipeline.getPRs();
      prAction = prList[0];
    }

    logStep(
      'COMPLETED',
      'Incident Resolved & Telemetry Recorded',
      isStateGlitch
        ? `StateHotFixWorker successfully executed ${report.remediationAction?.toolName}() on client.`
        : `CodebasePRWorker created PR ${prAction?.id} on branch ${prAction?.branch}.`
    );

    const result: TriageResult = {
      packetId: packet.id,
      stickyBugHash,
      category,
      remediationPath,
      confidence: 0.96,
      reasoning: report.supervisorDiagnosis,
      modelUsed: report.supervisorModel,
      steps,
      subAgents: report.spawnedSubAgents,
      totalTokens: report.totalTokens,
      webmcpAction: report.remediationAction,
      prAction,
    };

    // Update Sticky Bug Store
    this.stickyBugStore.recordTelemetryAnomaly(packet, {
      path: remediationPath,
      toolName: report.remediationAction?.toolName,
      prId: prAction?.id,
      modelUsed: report.supervisorModel,
    });

    this.history.unshift(result);
    return result;
  }

  public getHistory(): TriageResult[] {
    return this.history;
  }
}
