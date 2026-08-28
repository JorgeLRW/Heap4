import {
  SessionTelemetryPacket,
  CapturedConsoleEntry,
  CapturedNetworkEntry
} from './types';
import { WebMCPRegistry } from './registry';

export interface TelemetryConfig {
  maxConsoleLogs?: number;
  maxNetworkLogs?: number;
  userId?: string;
  enableDomSnapshot?: boolean;
  onPacketCaptured?: (packet: SessionTelemetryPacket) => void;
}

export class WebMCPTelemetry {
  private registry: WebMCPRegistry;
  private consoleLogs: CapturedConsoleEntry[] = [];
  private networkEntries: CapturedNetworkEntry[] = [];
  private config: Required<TelemetryConfig>;
  private originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
  };
  private originalFetch = typeof window !== 'undefined' ? window.fetch : undefined;
  private isListening = false;

  constructor(registry: WebMCPRegistry, config: TelemetryConfig = {}) {
    this.registry = registry;
    this.config = {
      maxConsoleLogs: config.maxConsoleLogs ?? 50,
      maxNetworkLogs: config.maxNetworkLogs ?? 30,
      userId: config.userId ?? 'usr_demo_' + Math.random().toString(36).substring(2, 8),
      enableDomSnapshot: config.enableDomSnapshot ?? true,
      onPacketCaptured: config.onPacketCaptured ?? (() => {}),
    };
  }

  public start(): void {
    if (this.isListening || typeof window === 'undefined') return;
    this.isListening = true;

    // 1. Console Interception
    const pushLog = (type: 'log' | 'warn' | 'error' | 'info', args: any[]) => {
      const sanitizedArgs = args.map((arg) => {
        try {
          if (typeof arg === 'object') return JSON.parse(JSON.stringify(arg));
          return String(arg);
        } catch {
          return '[Unserializable]';
        }
      });

      this.consoleLogs.push({
        type,
        timestamp: new Date().toISOString(),
        args: sanitizedArgs,
      });

      if (this.consoleLogs.length > this.config.maxConsoleLogs) {
        this.consoleLogs.shift();
      }
    };

    console.log = (...args) => {
      this.originalConsole.log.apply(console, args);
      pushLog('log', args);
    };
    console.warn = (...args) => {
      this.originalConsole.warn.apply(console, args);
      pushLog('warn', args);
    };
    console.error = (...args) => {
      this.originalConsole.error.apply(console, args);
      pushLog('error', args);
    };
    console.info = (...args) => {
      this.originalConsole.info.apply(console, args);
      pushLog('info', args);
    };

    // 2. Network Interception
    const origFetch = this.originalFetch;
    if (origFetch) {
      window.fetch = async (...args: any[]) => {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url || 'unknown';
        const method = typeof args[0] === 'object' && 'method' in args[0] ? (args[0] as any).method : args[1]?.method || 'GET';
        const startTime = performance.now();
        const timestamp = new Date().toISOString();

        try {
          const response = await origFetch.apply(window, args as [any, any?]);
          this.networkEntries.push({
            url,
            method,
            status: response.status,
            durationMs: Math.round(performance.now() - startTime),
            timestamp,
            failed: !response.ok,
          });
          if (this.networkEntries.length > this.config.maxNetworkLogs) this.networkEntries.shift();
          return response;
        } catch (err) {
          this.networkEntries.push({
            url,
            method,
            status: 0,
            durationMs: Math.round(performance.now() - startTime),
            timestamp,
            failed: true,
          });
          if (this.networkEntries.length > this.config.maxNetworkLogs) this.networkEntries.shift();
          throw err;
        }
      };
    }

    // 3. Uncaught Exception Interception
    window.onerror = (message, source, lineno, colno, error) => {
      this.captureAndEmitError({
        message: String(message),
        stack: error?.stack,
        type: 'uncaught_exception',
        source: source ? String(source) : undefined,
        lineno,
        colno,
      });
      return false;
    };

    // 4. Unhandled Rejection Interception
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      this.captureAndEmitError({
        message: reason?.message || String(reason),
        stack: reason?.stack,
        type: 'unhandled_rejection',
      });
    });

    console.info('%c[WebMCP Telemetry] Listening for browser errors and state anomalies.', 'color: #38bdf8;');
  }

  /**
   * Manually create and report a state glitch or bug packet
   */
  public reportAnomaly(message: string, customStack?: string, clientState?: Record<string, any>): SessionTelemetryPacket {
    return this.captureAndEmitError(
      {
        message,
        stack: customStack || new Error(message).stack,
        type: 'custom_report',
      },
      clientState
    );
  }

  private captureAndEmitError(
    errorInfo: {
      message: string;
      stack?: string;
      type: 'uncaught_exception' | 'unhandled_rejection' | 'custom_report';
      source?: string;
      lineno?: number;
      colno?: number;
    },
    customState?: Record<string, any>
  ): SessionTelemetryPacket {
    const packet: SessionTelemetryPacket = {
      id: 'pkt_' + Math.random().toString(36).substring(2, 10),
      timestamp: new Date().toISOString(),
      userId: this.config.userId,
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      error: errorInfo,
      consoleLogs: [...this.consoleLogs],
      networkEntries: [...this.networkEntries],
      domSnapshot: this.config.enableDomSnapshot && typeof document !== 'undefined'
        ? {
            html: document.body.innerHTML.substring(0, 1500),
            activeElement: document.activeElement?.tagName,
            url: window.location.href,
          }
        : undefined,
      clientState: customState,
      availableWebMcpTools: this.registry.listTools(),
    };

    this.registry.emit('telemetry:captured', packet);
    this.config.onPacketCaptured(packet);
    return packet;
  }

  public getRecentLogs(): CapturedConsoleEntry[] {
    return [...this.consoleLogs];
  }

  public getRecentNetwork(): CapturedNetworkEntry[] {
    return [...this.networkEntries];
  }
}
