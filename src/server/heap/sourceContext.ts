/**
 * sourceContext.ts
 * Minimal source-context resolver mapping runtime stack frames to implementation context.
 */

export interface SourceLocation {
  file: string;
  line: number;
  symbol: string;
  linesRange: string;
  build: string;
  snippet: string;
}

export function resolveSourceContext(file: string, line: number, symbol: string, build: string): SourceLocation {
  if (file.includes('DeliveryService') || symbol.includes('sendInvoiceDelivery')) {
    return {
      file: 'src/server/services/DeliveryService.ts',
      line: 42,
      symbol: 'DeliveryService.sendInvoiceDelivery',
      linesRange: '36-48',
      build,
      snippet: `36:   public static async sendInvoiceDelivery(invoice: Invoice) {
37:     // Check delivery provider configuration
38:     if (this.demoFailureEnabled) {
39:       // LINE 42: Simulated configuration failure in demo-build-a
40:       const err = new Error('DELIVERY_PROVIDER_CONFIGURATION_ERROR: Missing TLS cert');
41:       err.name = 'DeliveryConfigurationException';
42:       throw err;
43:     }
44: 
45:     invoice.deliveryStatus = 'sent';
46:     return { success: true, messageId: \`msg_\${Date.now()}\` };
47:   }`,
    };
  }

  return {
    file,
    line,
    symbol,
    linesRange: `${line - 5}-${line + 5}`,
    build,
    snippet: `// Source context for ${symbol} at line ${line}`,
  };
}
