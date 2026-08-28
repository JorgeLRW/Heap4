import { InMemoryDemoApi } from '../server/demoStore';
import { intentRuntime } from '../src/client/heap/intentRuntime';
import {
  InMemoryModelContext,
  clearTestModelContext,
  installTestModelContext,
} from '../src/webmcp/modelContext';
import {
  initializeWebMCPTools,
  resetWebMCPRegistrationForTests,
} from '../src/client/webmcp/registerTools';
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

async function runWebMCPTests() {
  console.log('\n🧪 Running tests/webmcp.test.ts...\n');
  clearTestModelContext();
  resetWebMCPRegistrationForTests();

  // Production must fail closed when no native browser API is present.
  let unavailableWithoutNativeApi = false;
  try {
    await initializeWebMCPTools();
  } catch {
    unavailableWithoutNativeApi = true;
  }
  assert(unavailableWithoutNativeApi, 'Production registration does not install a fake document.modelContext');

  const modelContext = new InMemoryModelContext();
  installTestModelContext(modelContext);
  resetWebMCPRegistrationForTests();

  const api = new InMemoryDemoApi();
  intentRuntime.setApiForTesting(api);
  await intentRuntime.resetDemo();
  await initializeWebMCPTools();

  const baseTools = await modelContext.getTools();
  assert(baseTools.length === 5, 'Exactly five focused base tools are registered');
  assert(baseTools.some((tool) => tool.name === 'request_repair'), 'Repair handoff is exposed through WebMCP');
  assert(!baseTools.some((tool) => tool.name === 'resume_intent'), 'Resume is absent before a repair is deployed');

  intentRuntime.createIntent(createInvoiceIntent());
  await intentRuntime.executeSendInvoiceWorkflow('int_2841');

  const listTool = baseTools.find((tool) => tool.name === 'list_active_intents')!;
  const listResult = await modelContext.executeTool(listTool, '{}');
  assert(listResult.intents[0].intentId === 'int_2841', 'Cold discovery finds the interrupted intent');

  const inspectTool = baseTools.find((tool) => tool.name === 'inspect_intent')!;
  const inspectResult = await modelContext.executeTool(inspectTool, JSON.stringify({ intentId: 'int_2841' }));
  assert(inspectResult.failure.request.httpStatus === 500, 'Agent receives correlated HTTP failure context');
  assert(inspectResult.failure.source.line === 42, 'Agent receives relevant source context');

  const requestRepairTool = baseTools.find((tool) => tool.name === 'request_repair')!;
  const repairResult = await modelContext.executeTool(requestRepairTool, JSON.stringify({ intentId: 'int_2841' }));
  assert(repairResult.repairJob.approvalRequired === true, 'Agent can propose but cannot deploy the repair');

  await intentRuntime.deployRepair(repairResult.repairJob.id);
  const repairedTools = await modelContext.getTools();
  const resumeTool = repairedTools.find((tool) => tool.name === 'resume_intent');
  assert(repairedTools.length === 6 && Boolean(resumeTool), 'resume_intent appears only after approved deployment');

  const resumeResult = await modelContext.executeTool(resumeTool!, JSON.stringify({ intentId: 'int_2841' }));
  assert(resumeResult.status === 'completed', 'WebMCP resumes only the missing workflow step');

  const verifyTool = repairedTools.find((tool) => tool.name === 'verify_intent')!;
  const verifyResult = await modelContext.executeTool(verifyTool, JSON.stringify({ intentId: 'int_2841' }));
  assert(verifyResult.goalSatisfied === true, 'Original user goal verifies from server state');
  assert(verifyResult.invoiceCreateCount === 1, 'No-duplicate invariant verifies from server state');

  await new Promise((resolve) => setTimeout(resolve, 1));
  const completedTools = await modelContext.getTools();
  assert(completedTools.length === 5, 'Dynamic resume tool is removed after completion');

  console.log(`\nResults: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) process.exit(1);
}

runWebMCPTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
