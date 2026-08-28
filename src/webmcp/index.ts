import { WebMCPRegistry } from './registry';
import { WebMCPTelemetry, TelemetryConfig } from './telemetry';
import { WebMCPTransport, TransportConfig } from './transport';

export * from './types';
export * from './registry';
export * from './telemetry';
export * from './transport';

export interface WebMCPOptions {
  telemetry?: TelemetryConfig;
  transport?: TransportConfig;
}

let globalRegistry: WebMCPRegistry | null = null;
let globalTelemetry: WebMCPTelemetry | null = null;
let globalTransport: WebMCPTransport | null = null;

/**
 * Initialize WebMCP standard runtime in the browser
 */
export function initWebMCP(options: WebMCPOptions = {}): {
  registry: WebMCPRegistry;
  telemetry: WebMCPTelemetry;
  transport: WebMCPTransport;
} {
  if (!globalRegistry) {
    globalRegistry = new WebMCPRegistry();
    globalTelemetry = new WebMCPTelemetry(globalRegistry, options.telemetry);
    globalTransport = new WebMCPTransport(globalRegistry, options.transport);

    globalTelemetry.start();
    globalTransport.connect();
  }

  return {
    registry: globalRegistry,
    telemetry: globalTelemetry!,
    transport: globalTransport!,
  };
}

export function getWebMCP(): {
  registry: WebMCPRegistry;
  telemetry: WebMCPTelemetry;
  transport: WebMCPTransport;
} {
  if (!globalRegistry) {
    return initWebMCP();
  }
  return {
    registry: globalRegistry,
    telemetry: globalTelemetry!,
    transport: globalTransport!,
  };
}
