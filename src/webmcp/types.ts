/**
 * WebMCP Specification Types
 * Standardizing client-side tool registry and autonomous agent interaction.
 */

export type PermissionLevel = 'read' | 'mutate' | 'destructive';

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  default?: any;
}

export interface JSONSchemaParameters {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface WebMCPToolDefinition<TParams = any, TResult = any> {
  name: string;
  description: string;
  permission?: PermissionLevel;
  parameters: JSONSchemaParameters;
  handler: (params: TParams) => Promise<TResult> | TResult;
}

export interface WebMCPExportedTool {
  name: string;
  description: string;
  permission: PermissionLevel;
  parameters: JSONSchemaParameters;
}

export interface WebMCPToolExecutionResult {
  toolName: string;
  status: 'success' | 'error' | 'permission_denied';
  result?: any;
  error?: string;
  executionTimeMs: number;
  timestamp: string;
}

export interface CapturedConsoleEntry {
  type: 'log' | 'warn' | 'error' | 'info';
  timestamp: string;
  args: any[];
}

export interface CapturedNetworkEntry {
  url: string;
  method: string;
  status?: number;
  durationMs?: number;
  timestamp: string;
  failed?: boolean;
}

export interface SessionTelemetryPacket {
  id: string;
  timestamp: string;
  userId: string;
  url: string;
  userAgent: string;
  error: {
    message: string;
    stack?: string;
    type: 'uncaught_exception' | 'unhandled_rejection' | 'custom_report';
    source?: string;
    lineno?: number;
    colno?: number;
  };
  consoleLogs: CapturedConsoleEntry[];
  networkEntries: CapturedNetworkEntry[];
  domSnapshot?: {
    html: string;
    activeElement?: string;
    url: string;
  };
  clientState?: Record<string, any>;
  availableWebMcpTools: WebMCPExportedTool[];
}

export interface WebMCPEventMap {
  'tool:registered': { tool: WebMCPExportedTool };
  'tool:unregistered': { name: string };
  'tool:executing': { name: string; params: any };
  'tool:executed': WebMCPToolExecutionResult;
  'telemetry:captured': SessionTelemetryPacket;
  'telemetry:error': { error: Error };
  'agent:connected': { agentId: string };
  'agent:disconnected': { reason: string };
  'agent:message': { type: string; payload: any };
}
