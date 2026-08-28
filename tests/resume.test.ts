import { InMemoryDemoApi } from '../server/demoStore';
import { intentRuntime } from '../src/client/heap/intentRuntime';
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

async function runResumeTests() {
  console.log('\n🧪 Running tests/resume.test.ts...\n');
  const api = new InMemoryDemoApi();
  intentRuntime.setApiForTesting(api);
  await intentRuntime.resetDemo();
  intentRuntime.createIntent(createInvoiceIntent());
  await intentRuntime.executeSendInvoiceWorkflow('int_2841');

  let rejectedWhileBlocked = false;
  try {
    await intentRuntime.resumeIntent('int_2841');
  } catch {
    rejectedWhileBlocked = true;
  }
  assert(rejectedWhileBlocked, 'Server rejects resume while the defect is blocked');

  const repair = await intentRuntime.requestRepair('int_2841');
  assert(repair.status === 'patch_proposed', 'Engineering worker proposes a reviewable patch');
  assert(repair.approvalRequired === true, 'Repair cannot self-deploy');
  assert(repair.artifact.patch.includes('deliverOnce'), 'Repair contains a concrete scoped patch');
  assert(repair.artifact.regressionTest.includes('invoiceCreateCount remains 1'), 'Repair contains an invariant regression test');

  const build = await intentRuntime.deployRepair(repair.id);
  assert(build === 'demo-build-b', 'Explicit approval deploys demo-build-b');
  assert(intentRuntime.getIntent('int_2841')?.status === 'resumable', 'Blocked intent becomes RESUMABLE');

  const resumed = await intentRuntime.resumeIntent('int_2841');
  const serverState = await api.getState();
  assert(resumed.intent.status === 'completed', 'Resumed intent becomes COMPLETED');
  assert(serverState.invoice?.deliveryStatus === 'sent', 'Only the missing delivery step completes');
  assert(serverState.invoiceCreateCount === 1, 'Resume never duplicates the invoice');

  console.log(`\nResults: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) process.exit(1);
}

runResumeTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
