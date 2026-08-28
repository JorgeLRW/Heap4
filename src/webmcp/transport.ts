import { WebMCPRegistry } from './registry';
import { SessionTelemetryPacket, WebMCPToolExecutionResult } from './types';

export interface TransportConfig {
  serverWsUrl?: string;
  serverHttpUrl?: string;
  autoReconnect?: boolean;
  onStatusChange?: (status: 'connected' | 'connecting' | 'disconnected') => void;
  onAgentTriageUpdate?: (update: any) => void;
}

export class WebMCPTransport {
  private registry: WebMCPRegistry;
  private ws: WebSocket | null = null;
  private config: Required<TransportConfig>;
  private reconnectTimer: any = null;
  private status: 'connected' | 'connecting' | 'disconnected' = 'disconnected';

  constructor(registry: WebMCPRegistry, config: TransportConfig = {}) {
    this.registry = registry;
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:5173';

    this.config = {
      serverWsUrl: config.serverWsUrl || `${protocol}//${host}/ws`,
      serverHttpUrl: config.serverHttpUrl || '/api/telemetry/report',
      autoReconnect: config.autoReconnect ?? true,
      onStatusChange: config.onStatusChange ?? (() => {}),
      onAgentTriageUpdate: config.onAgentTriageUpdate ?? (() => {}),
    };

    // Forward local telemetry to the server
    this.registry.on('telemetry:captured', (packet) => {
      this.sendPacket(packet);
    });
  }

  public connect(): void {
    if (typeof window === 'undefined' || this.ws) return;

    this.setStatus('connecting');
    try {
      this.ws = new WebSocket(this.config.serverWsUrl);

      this.ws.onopen = () => {
        this.setStatus('connected');
        console.info('%c[WebMCP Transport] Connected to Agent Triage Backend', 'color: #22c55e;');

        // Send handshake announcing available tools
        this.send({
          type: 'client_handshake',
          payload: {
            clientId: 'client_' + Math.random().toString(36).substring(2, 9),
            tools: this.registry.listTools(),
            timestamp: new Date().toISOString(),
          },
        });
      };

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleIncomingMessage(data);
        } catch (err) {
          console.error('[WebMCP Transport] Failed to parse message:', err);
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.setStatus('disconnected');
        if (this.config.autoReconnect) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => this.connect(), 2500);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[WebMCP Transport] WebSocket error, will retry...', err);
        this.ws?.close();
      };
    } catch (e) {
      this.setStatus('disconnected');
    }
  }

  public disconnect(): void {
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  private setStatus(newStatus: 'connected' | 'connecting' | 'disconnected') {
    this.status = newStatus;
    this.config.onStatusChange(newStatus);
  }

  public getStatus() {
    return this.status;
  }

  /**
   * Handle incoming messages from the AI Agent Backend
   */
  private async handleIncomingMessage(message: any) {
    if (!message || !message.type) return;

    // 1. Agent requesting tool execution in the user browser tab
    if (message.type === 'execute_tool_request') {
      const { executionId, toolName, parameters } = message.payload;
      console.info(`%c[WebMCP] Agent requested execution of tool: "${toolName}"`, 'color: #f59e0b; font-weight: bold;', parameters);

      const executionResult: WebMCPToolExecutionResult = await this.registry.executeTool(toolName, parameters);

      // Return result back to the Agent
      this.send({
        type: 'execute_tool_response',
        payload: {
          executionId,
          ...executionResult,
        },
      });
    }

    // 2. Agent triage pipeline updates (for live UI feedback)
    if (message.type === 'agent_triage_stream' || message.type === 'agent_remediation_notification') {
      this.config.onAgentTriageUpdate(message);
    }
  }

  /**
   * Send a telemetry packet to backend
   */
  public async sendPacket(packet: SessionTelemetryPacket): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({
        type: 'telemetry_packet',
        payload: packet,
      });
    } else {
      // HTTP fallback
      try {
        await fetch(this.config.serverHttpUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(packet),
        });
      } catch (err) {
        console.warn('[WebMCP Transport] HTTP telemetry fallback failed:', err);
      }
    }
  }

  public send(msg: { type: string; payload: any }): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
