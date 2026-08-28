import {
  WebMCPToolDefinition,
  WebMCPExportedTool,
  WebMCPToolExecutionResult,
  JSONSchemaParameters,
  PermissionLevel,
  WebMCPEventMap
} from './types';

type EventCallback<K extends keyof WebMCPEventMap> = (data: WebMCPEventMap[K]) => void;

export class WebMCPRegistry {
  private tools: Map<string, WebMCPToolDefinition> = new Map();
  private listeners: Map<keyof WebMCPEventMap, Set<Function>> = new Map();
  private maxExecutionTimeoutMs: number = 10000;
  private autoApprovePermissions: Set<PermissionLevel> = new Set(['read', 'mutate']);

  constructor() {
    // Automatically attach to window for standardized access
    if (typeof window !== 'undefined') {
      (window as any).webmcp = this;
    }
  }

  /**
   * Register a tool for WebMCP agents to invoke
   */
  public registerTool<TParams = any, TResult = any>(tool: WebMCPToolDefinition<TParams, TResult>): void {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('[WebMCP] Tool registration failed: name is required and must be a string.');
    }
    if (!tool.description || typeof tool.description !== 'string') {
      throw new Error(`[WebMCP] Tool "${tool.name}" registration failed: description is required.`);
    }
    if (!tool.parameters || tool.parameters.type !== 'object') {
      throw new Error(`[WebMCP] Tool "${tool.name}" registration failed: parameters must be of type 'object'.`);
    }
    if (typeof tool.handler !== 'function') {
      throw new Error(`[WebMCP] Tool "${tool.name}" registration failed: handler must be a function.`);
    }

    const permission: PermissionLevel = tool.permission || 'mutate';
    const normalizedTool: WebMCPToolDefinition<TParams, TResult> = {
      ...tool,
      permission,
    };

    this.tools.set(tool.name, normalizedTool);
    this.emit('tool:registered', {
      tool: {
        name: normalizedTool.name,
        description: normalizedTool.description,
        permission: normalizedTool.permission!,
        parameters: normalizedTool.parameters,
      },
    });

    console.info(`%c[WebMCP] Registered tool: ${tool.name} (${permission})`, 'color: #22c55e; font-weight: bold;');
  }

  /**
   * Unregister an existing tool
   */
  public unregisterTool(name: string): boolean {
    const deleted = this.tools.delete(name);
    if (deleted) {
      this.emit('tool:unregistered', { name });
    }
    return deleted;
  }

  /**
   * List all registered tools in OpenAPI/JSON-Schema format for AI agents
   */
  public listTools(): WebMCPExportedTool[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      permission: tool.permission || 'mutate',
      parameters: tool.parameters,
    }));
  }

  /**
   * Get specific tool metadata
   */
  public getTool(name: string): WebMCPExportedTool | undefined {
    const tool = this.tools.get(name);
    if (!tool) return undefined;
    return {
      name: tool.name,
      description: tool.description,
      permission: tool.permission || 'mutate',
      parameters: tool.parameters,
    };
  }

  /**
   * Validate params against JSON Schema
   */
  public validateParams(schema: JSONSchemaParameters, params: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!params || typeof params !== 'object') {
      if (schema.required && schema.required.length > 0) {
        return { valid: false, errors: ['Expected parameters object, received null or non-object'] };
      }
      params = {};
    }

    // Check required fields
    if (schema.required) {
      for (const reqField of schema.required) {
        if (params[reqField] === undefined || params[reqField] === null) {
          errors.push(`Missing required parameter: "${reqField}"`);
        }
      }
    }

    // Check property types
    for (const [propName, propSchema] of Object.entries(schema.properties || {})) {
      const val = params[propName];
      if (val !== undefined && val !== null) {
        const actualType = Array.isArray(val) ? 'array' : typeof val;
        if (propSchema.type && actualType !== propSchema.type) {
          errors.push(`Parameter "${propName}" expected type "${propSchema.type}", got "${actualType}"`);
        }
        if (propSchema.enum && !propSchema.enum.includes(val)) {
          errors.push(`Parameter "${propName}" value "${val}" not in enum [${propSchema.enum.join(', ')}]`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Execute a registered tool (called by AI agents or client bridge)
   */
  public async executeTool(name: string, rawParams: any = {}): Promise<WebMCPToolExecutionResult> {
    const startTime = performance.now();
    const timestamp = new Date().toISOString();

    const tool = this.tools.get(name);
    if (!tool) {
      const res: WebMCPToolExecutionResult = {
        toolName: name,
        status: 'error',
        error: `Tool "${name}" is not registered in window.webmcp`,
        executionTimeMs: Math.round(performance.now() - startTime),
        timestamp,
      };
      this.emit('tool:executed', res);
      return res;
    }

    // Permission check
    const permission = tool.permission || 'mutate';
    if (!this.autoApprovePermissions.has(permission)) {
      const res: WebMCPToolExecutionResult = {
        toolName: name,
        status: 'permission_denied',
        error: `Execution blocked: Tool "${name}" requires '${permission}' permission approval.`,
        executionTimeMs: Math.round(performance.now() - startTime),
        timestamp,
      };
      this.emit('tool:executed', res);
      return res;
    }

    // Validate parameters
    const validation = this.validateParams(tool.parameters, rawParams);
    if (!validation.valid) {
      const res: WebMCPToolExecutionResult = {
        toolName: name,
        status: 'error',
        error: `Schema validation failed: ${validation.errors.join('; ')}`,
        executionTimeMs: Math.round(performance.now() - startTime),
        timestamp,
      };
      this.emit('tool:executed', res);
      return res;
    }

    this.emit('tool:executing', { name, params: rawParams });

    try {
      // Execute with timeout safeguard
      const executionPromise = Promise.resolve(tool.handler(rawParams));
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Execution timed out after ${this.maxExecutionTimeoutMs}ms`)), this.maxExecutionTimeoutMs)
      );

      const result = await Promise.race([executionPromise, timeoutPromise]);
      const res: WebMCPToolExecutionResult = {
        toolName: name,
        status: 'success',
        result,
        executionTimeMs: Math.round(performance.now() - startTime),
        timestamp,
      };
      this.emit('tool:executed', res);
      return res;
    } catch (err: any) {
      const res: WebMCPToolExecutionResult = {
        toolName: name,
        status: 'error',
        error: err?.message || String(err),
        executionTimeMs: Math.round(performance.now() - startTime),
        timestamp,
      };
      this.emit('tool:executed', res);
      return res;
    }
  }

  /**
   * Event subscription system
   */
  public on<K extends keyof WebMCPEventMap>(event: K, callback: EventCallback<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  public emit<K extends keyof WebMCPEventMap>(event: K, data: WebMCPEventMap[K]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error(`[WebMCP] Error in event listener for "${String(event)}":`, e);
        }
      });
    }
  }
}
