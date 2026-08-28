import { InMemoryDemoApi } from '../server/demoStore';
import { IntentRuntime, intentRuntime } from '../src/client/heap/intentRuntime';
import { createInvoiceIntent } from './fixtures';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function runIntentTests() {
  console.log('\n🧪 Running tests/intent.test.ts...\n');
  const api = new InMemoryDemoApi();
  intentRuntime.setApiForTesting(api);
  await intentRuntime.resetDemo();

  const intent = intentRuntime.createIntent(createInvoiceIntent());
  assert(intent.status === 'active', 'Intent exists before the dangerous request');

  const result = await intentRuntime.executeSendInvoiceWorkflow(intent.id);
  const serverState = await api.getState();

  assert(result.success === false, 'Server returns the controlled failure');
  assert(result.intent.runtimeContext?.request.httpStatus === 500, 'Failure capsule contains HTTP 500');
  assert(result.intent.status === 'blocked', 'Intent transitions to BLOCKED');
  assert(serverState.invoice?.id === 'INV-2841', 'Invoice persisted before delivery failed');
  assert(serverState.invoice?.amount === 4850, 'Original amount remains $4,850');
  assert(serverState.invoiceCreateCount === 1, 'Exactly one invoice record exists');
  assert(result.intent.runtimeContext?.source.line === 42, 'Failure maps to the relevant source line');

  const freshPageRuntime = new IntentRuntime();
  freshPageRuntime.setApiForTesting(api);
  await freshPageRuntime.hydrateFromServer();
  assert(freshPageRuntime.getIntent('int_2841')?.status === 'blocked', 'A fresh page restores the same interrupted intent');

  console.log(`\nResults: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) process.exit(1);
}

runIntentTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
