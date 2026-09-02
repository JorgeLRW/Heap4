import { InMemoryDemoApi } from '../server/demoStore';
import { intentRuntime } from '../src/client/heap/intentRuntime';
import { ACCESS_ROUTE_PREFIX } from '../src/shared/accessGrants';
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

/** Lets the deferred surface sync scheduled by a tool call settle. */
function flushSurfaceSync() {
  return new Promise((resolve) => setTimeout(resolve, 2));
}

async function toolNames(context: InMemoryModelContext): Promise<string[]> {
  return (await context.getTools()).map((tool) => tool.name);
}

async function runAlternateRouteTests() {
  console.log('\n🧪 Running tests/alternateRoute.test.ts...\n');

  const modelContext = new InMemoryModelContext();
  installTestModelContext(modelContext);
  resetWebMCPRegistrationForTests();

  const api = new InMemoryDemoApi();
  intentRuntime.setApiForTesting(api);
  await intentRuntime.resetDemo();
  await initializeWebMCPTools();

  intentRuntime.createIntent(createInvoiceIntent());
  await intentRuntime.executeSendInvoiceWorkflow('int_2841');
  await flushSurfaceSync();

  let names = await toolNames(modelContext);
  assert(
    names.includes('get_recovery_options') && names.includes('deliver_by_alternate_route'),
    'The recovery plan and alternate route appear as soon as the primary route breaks',
  );
  assert(
    !names.includes('revoke_alternate_delivery') && !names.includes('resume_intent'),
    'Revoke and resume stay absent while no link exists and no repair is deployed',
  );

  const plan = await modelContext.executeTool(
    'get_recovery_options',
    JSON.stringify({ intentId: 'int_2841' }),
  );
  assert(plan.outcome.includes('Acme Corp can read invoice'), 'The agent can explain the preserved outcome');
  assert(
    plan.approvedAlternates[0].requiresUserConfirmation === true,
    'The recovery plan requires user confirmation before an external action',
  );

  const missingConfirmation = await modelContext.executeTool(
    'deliver_by_alternate_route',
    JSON.stringify({ intentId: 'int_2841', userConfirmation: '' }),
  );
  assert(
    missingConfirmation.error === 'user_confirmation_required',
    'The agent cannot issue a share link without an explicit user confirmation',
  );

  // The agent reaches the outcome without waiting for engineering.
  const routeResult = await modelContext.executeTool(
    'deliver_by_alternate_route',
    JSON.stringify({ intentId: 'int_2841', userConfirmation: 'I approve the one-hour read-only share link.' }),
  );
  await flushSurfaceSync();

  assert(routeResult.outcomeReached === true, 'The agent reaches the outcome through the alternate route');
  assert(
    routeResult.primaryRouteStillBroken === true,
    'The alternate route reports that it did not repair the defect',
  );
  assert(
    typeof routeResult.accessUrl === 'string' && routeResult.accessUrl.startsWith(ACCESS_ROUTE_PREFIX),
    'A capability URL is returned once, at issue time',
  );

  const mitigated = await api.getState();
  assert(mitigated.intent?.status === 'mitigated', 'The intent becomes mitigated rather than completed');
  assert(
    mitigated.invoice?.deliveryStatus === 'pending',
    'The invoice is never marked sent by a workaround',
  );
  assert(mitigated.invoice?.amount === 4850, 'NEVER_MODIFY_AMOUNT holds across the alternate route');
  assert(mitigated.invoiceCreateCount === 1, 'NEVER_DUPLICATE_INVOICE holds across the alternate route');
  assert(
    mitigated.accessGrant !== null && !('token' in (mitigated.accessGrant as object)),
    'Only the token digest is persisted server-side',
  );
  assert(
    mitigated.recoveryApproval?.route === 'secure_share_link' &&
      mitigated.recoveryApproval.channel === 'webmcp_agent_conversation',
    'The server records the confirmed route without persisting the user’s words',
  );
  assert(
    mitigated.repairJob !== null && mitigated.repairJob.status !== 'approved_and_deployed',
    'The engineering repair remains open while the workaround is live',
  );

  names = await toolNames(modelContext);
  assert(
    !names.includes('deliver_by_alternate_route') && names.includes('revoke_alternate_delivery'),
    'Issuing a link withdraws the issue capability and exposes the revoke capability',
  );

  // The link is a real, scoped read path, not a decorative string.
  const token = routeResult.accessUrl.slice(ACCESS_ROUTE_PREFIX.length);
  const recipientView = await intentRuntime.readInvoiceByAccessToken(token);
  assert(recipientView.success === true, 'The recipient can read the invoice through the share link');
  assert(recipientView.invoice?.amount === 4850, 'The share link exposes the original invoice amount');
  assert(
    recipientView.invoice?.scope === 'read_invoice_only',
    'The share link is scoped to reading one invoice',
  );

  const forgedView = await intentRuntime.readInvoiceByAccessToken(`${token}tampered`);
  assert(forgedView.success === false, 'A tampered capability token is rejected');

  let secondGrantRejected = false;
  try {
    await intentRuntime.grantAlternateAccess('int_2841', 'I approve a replacement link.', 'user');
  } catch {
    secondGrantRejected = true;
  }
  assert(secondGrantRejected, 'A second live share link cannot be issued for the same invoice');

  // Engineering still lands the real fix underneath the workaround.
  await intentRuntime.requestRepair('int_2841');
  await intentRuntime.deployRepair(intentRuntime.getRepairJob()!.id);
  await flushSurfaceSync();

  names = await toolNames(modelContext);
  assert(
    names.includes('resume_intent') && names.includes('revoke_alternate_delivery'),
    'A deployed repair adds resume without silently dropping the live workaround',
  );
  assert(
    !names.includes('deliver_by_alternate_route'),
    'The alternate route is withdrawn once the primary route is healthy',
  );

  const resumeResult = await modelContext.executeTool(
    'resume_intent',
    JSON.stringify({ intentId: 'int_2841' }),
  );
  await flushSurfaceSync();
  assert(resumeResult.status === 'completed', 'The primary route completes after the repair is deployed');

  const completed = await api.getState();
  assert(completed.invoice?.deliveryStatus === 'sent', 'The invoice is finally sent through the primary route');
  assert(completed.invoiceCreateCount === 1, 'Mitigation plus resume still produced exactly one invoice');
  assert(
    completed.intent?.progress.goalSatisfiedVia === 'email_delivery',
    'The recorded route updates to the primary route once it succeeds',
  );

  // The agent cleans up the capability it created.
  const revokeResult = await modelContext.executeTool(
    'revoke_alternate_delivery',
    JSON.stringify({ intentId: 'int_2841', reason: 'The invoice was emailed after the repair shipped.' }),
  );
  await flushSurfaceSync();
  assert(revokeResult.revoked === true, 'The agent can revoke the workaround it issued');

  const revokedView = await intentRuntime.readInvoiceByAccessToken(token);
  assert(revokedView.success === false, 'A revoked share link stops resolving immediately');

  names = await toolNames(modelContext);
  assert(
    !names.includes('revoke_alternate_delivery') && !names.includes('resume_intent'),
    'The dynamic surface returns to the base tools once nothing is outstanding',
  );

  clearTestModelContext();
  resetWebMCPRegistrationForTests();

  console.log(`\nResults: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) process.exit(1);
}

runAlternateRouteTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
