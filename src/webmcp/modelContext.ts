/**
 * Thin access layer for the browser-provided WebMCP API.
 *
 * Production code must register on the native `document.modelContext` object.
 * This module deliberately does not polyfill that property: a JavaScript shim can
 * make in-page tests look healthy while remaining invisible to the browser agent.
 */

export interface ModelContextToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

export interface ModelContextTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
  execute: (inputObject: any, context?: { signal?: AbortSignal }) => Promise<any> | any;
  annotations?: ModelContextToolAnnotations;
}

export interface ModelContextRegistrationOptions {
  signal?: AbortSignal;
  exposedTo?: string[];
}

export interface RegisteredTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: unknown;
  annotations?: ModelContextToolAnnotations;
  origin?: string;
  window?: Window;
}

export interface ModelContextApi {
  registerTool(tool: ModelContextTool, options?: ModelContextRegistrationOptions): Promise<void>;
  getTools?(options?: { fromOrigins?: string[] }): Promise<RegisteredTool[]>;
  getToolsSync(): RegisteredTool[];
  unregisterTool(name: string): Promise<void> | void;
  executeTool(
    tool: RegisteredTool | string,
    inputJson: string | Record<string, unknown>,
    options?: { signal?: AbortSignal }
  ): Promise<any>;
  addEventListener?(type: 'toolchange', listener: EventListenerOrEventListenerObject): void;
}

export class WebMCPUnavailableError extends Error {
  constructor() {
    super(
      'Native WebMCP is unavailable. Open this page in ChatGPT\'s in-app browser, join the Chrome origin trial, or enable chrome://flags/#enable-webmcp-testing for local development.'
    );
    this.name = 'WebMCPUnavailableError';
  }
}

let testModelContext: ModelContextApi | null = null;
const trackedTools = new Map<string, RegisteredTool>();
const trackedToolListeners = new Set<() => void>();

function notifyTrackedTools() {
  trackedToolListeners.forEach((listener) => listener());
}

/** Returns the real browser API in production, or an explicitly installed test double. */
export function getModelContext(): ModelContextApi | null {
  if (testModelContext) return testModelContext;

  if (typeof document === 'undefined') return null;
  const candidate = (document as Document & { modelContext?: ModelContextApi }).modelContext;
  return candidate && typeof candidate.registerTool === 'function' ? candidate : null;
}

export function ensureModelContext(): ModelContextApi {
  const context = getModelContext();
  if (!context) throw new WebMCPUnavailableError();
  return context;
}

/**
 * Register on the native object and keep a separate UI-only inventory.
 * The inventory never participates in discovery or invocation.
 */
export async function registerModelContextTool(
  tool: ModelContextTool,
  options?: ModelContextRegistrationOptions
): Promise<void> {
  const context = ensureModelContext();
  await context.registerTool(tool, options);

  trackedTools.set(tool.name, {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema || { type: 'object', properties: {} },
    annotations: tool.annotations,
    origin: typeof location === 'undefined' ? 'test://heap-4' : location.origin,
  });
  notifyTrackedTools();

  options?.signal?.addEventListener(
    'abort',
    () => {
      trackedTools.delete(tool.name);
      notifyTrackedTools();
    },
    { once: true }
  );
}

export function getRegisteredToolsSnapshot(): RegisteredTool[] {
  return Array.from(trackedTools.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function subscribeRegisteredTools(listener: () => void): () => void {
  trackedToolListeners.add(listener);
  return () => trackedToolListeners.delete(listener);
}

/** In-memory implementation used only when a test explicitly installs it. */
export class InMemoryModelContext implements ModelContextApi {
  private tools = new Map<string, ModelContextTool>();

  async registerTool(tool: ModelContextTool, options?: ModelContextRegistrationOptions): Promise<void> {
    if (this.tools.has(tool.name)) {
      throw new DOMException(`Tool ${tool.name} is already registered.`, 'InvalidStateError');
    }
    this.tools.set(tool.name, tool);
    options?.signal?.addEventListener('abort', () => this.tools.delete(tool.name), { once: true });
  }

  async getTools(): Promise<RegisteredTool[]> {
    return this.getToolsSync();
  }

  getToolsSync(): RegisteredTool[] {
    return Array.from(this.tools.values())
      .map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema || { type: 'object', properties: {} },
        annotations: tool.annotations,
        origin: 'test://heap-4',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async unregisterTool(name: string): Promise<void> {
    this.tools.delete(name);
  }

  async executeTool(tool: RegisteredTool | string, inputJson: string | Record<string, unknown>): Promise<any> {
    const name = typeof tool === 'string' ? tool : tool.name;
    const definition = this.tools.get(name);
    if (!definition) throw new Error(`Tool ${name} is not registered.`);
    const input = typeof inputJson === 'string' ? JSON.parse(inputJson) : inputJson;
    return definition.execute(input as Record<string, unknown>);
  }
}

export function installTestModelContext(context: ModelContextApi = new InMemoryModelContext()): ModelContextApi {
  testModelContext = context;
  trackedTools.clear();
  notifyTrackedTools();
  return context;
}

export function clearTestModelContext(): void {
  testModelContext = null;
  trackedTools.clear();
  notifyTrackedTools();
}
