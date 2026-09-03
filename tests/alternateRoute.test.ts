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
    names.includes('inspect_customer_delivery_policy') &&
      names.includes('list_authorized_contacts') &&
      names.includes('create_scoped_access_grant'),
    'A blocked intent exposes policy facts, contacts, and a primitive grant action',
  );
  assert(
    !names.includes('get_recovery_options') && !names.includes('deliver_by_alternate_route'),
    'The site does not prescribe or package a recovery solution for the agent',
  );
  assert(
    !names.includes('revoke_alternate_delivery') && !names.includes('resume_intent'),
    'Revoke and resume stay absent while no link exists and no repair is deployed',
  );

  const policy = await modelContext.executeTool(
    'inspect_customer_delivery_policy',
    JSON.stringify({ intentId: 'int_2841' }),
  );
  assert(policy.customerId === 'ACME', 'The agent can inspect the customer policy as evidence');
  assert(
    policy.rules.some((rule: string) => rule.toLowerCase().includes('temporary external links')),
    'The policy is returned as semantic evidence rather than a recovery plan',
  );

  const contacts = await modelContext.executeTool(
    'list_authorized_contacts',
    JSON.stringify({ intentId: 'int_2841' }),
  );
  assert(contacts.contacts.length === 2, 'The agent can inspect candidate contacts without receiving a plan');

  const failedPortal = await modelContext.executeTool(
    'upload_invoice_to_procurement_portal',
    JSON.stringify({ intentId: 'int_2841', contactId: 'contact_dana_lee' }),
  );
  assert(
    failedPortal.error === 'capability_execution_failed' && failedPortal.message.includes('unavailable'),
    'An unexpected portal failure is returned as evidence so the agent can replan',
  );

  const missingConfirmation = await modelContext.executeTool(
    'create_scoped_access_grant',
    JSON.stringify({
      intentId: 'int_2841',
      contactId: 'contact_dana_lee',
      expirationMinutes: 60,
      scope: 'read_invoice_only',
      userConfirmation: '',
    }),
  );
  assert(
    missingConfirmation.error === 'user_confirmation_required',
    'The agent cannot issue a share link without an explicit user confirmation',
  );

  const ineligibleContact = await modelContext.executeTool(
    'create_scoped_access_grant',
    JSON.stringify({
      intentId: 'int_2841',
      contactId: 'contact_billing_archive',
      expirationMinutes: 60,
      scope: 'read_invoice_only',
      userConfirmation: 'I approve temporary invoice access.',
    }),
  );
  assert(
    ineligibleContact.error === 'policy_verification_failed',
    'The server rejects an archival contact even when the agent proposes it',
  );

  const excessiveExpiration = await modelContext.executeTool(
    'create_scoped_access_grant',
    JSON.stringify({
      intentId: 'int_2841',
      contactId: 'contact_dana_lee',
      expirationMinutes: 61,
      scope: 'read_invoice_only',
      userConfirmation: 'I approve temporary invoice access.',
    }),
  );
  assert(
    excessiveExpiration.error === 'policy_verification_failed',
    'The server rejects a grant longer than the natural-language policy permits',
  );

  let noticeWithoutGrantRejected = false;
  try {
    await api.sendAccessNotice(
      'int_2841',
      'contact_dana_lee',
      'Your temporary invoice access is ready.',
      false,
    );
  } catch {
    noticeWithoutGrantRejected = true;
  }
  assert(noticeWithoutGrantRejected, 'The server rejects an access notice before a grant exists');

  // The agent replans after the portal failure and composes a legal primitive call.
  const routeResult = await modelContext.executeTool(
    'create_scoped_access_grant',
    JSON.stringify({
      intentId: 'int_2841',
      contactId: 'contact_dana_lee',
      expirationMinutes: 60,
      scope: 'read_invoice_only',
      userConfirmation: 'I approve the one-hour read-only share link for Dana.',
    }),
  );
  await flushSurfaceSync();

  assert(
    routeResult.outcomeReached === false && routeResult.grantCreated === true,
    'Creating authority alone does not claim that the recipient received it',
  );
  assert(
    routeResult.primaryRouteStillBroken === true,
    'The alternate route reports that it did not repair the defect',
  );
  assert(
    typeof routeResult.accessUrl === 'string' && routeResult.accessUrl.startsWith(ACCESS_ROUTE_PREFIX),
    'A capability URL is returned once, at issue time',
  );

  const grantCreated = await api.getState();
  assert(grantCreated.intent?.status === 'blocked', 'The intent remains blocked until the grant is delivered');
  assert(grantCreated.accessNoticeReceipt === null, 'No delivery receipt exists after grant creation alone');
  assert(
    grantCreated.invoice?.deliveryStatus === 'pending',
    'The invoice is never marked sent by a workaround',
  );
  assert(grantCreated.invoice?.amount === 4850, 'NEVER_MODIFY_AMOUNT holds across the alternate route');
  assert(grantCreated.invoiceCreateCount === 1, 'NEVER_DUPLICATE_INVOICE holds across the alternate route');
  assert(
    grantCreated.accessGrant !== null && !('token' in (grantCreated.accessGrant as object)),
    'Only the token digest is persisted server-side',
  );
  assert(
    grantCreated.recoveryApproval?.route === 'secure_share_link' &&
      grantCreated.recoveryApproval.channel === 'webmcp_agent_conversation',
    'The server records the confirmed route without persisting the user’s words',
  );
  assert(
    grantCreated.repairJob !== null && grantCreated.repairJob.status !== 'approved_and_deployed',
    'The engineering repair remains open while the workaround is live',
  );

  names = await toolNames(modelContext);
  assert(
    !names.includes('create_scoped_access_grant') &&
      names.includes('send_access_notice') &&
      names.includes('revoke_access_grant'),
    'A minted grant withdraws issuance and exposes delivery plus revocation primitives',
  );

  const wrongNoticeContact = await modelContext.executeTool(
    'send_access_notice',
    JSON.stringify({
      intentId: 'int_2841',
      contactId: 'contact_billing_archive',
      message: 'Your temporary invoice access is ready.',
      includeAttachment: false,
    }),
  );
  assert(
    wrongNoticeContact.error === 'policy_verification_failed',
    'The server rejects delivery to a recipient outside the grant audience',
  );

  const attachedNotice = await modelContext.executeTool(
    'send_access_notice',
    JSON.stringify({
      intentId: 'int_2841',
      contactId: 'contact_dana_lee',
      message: 'Your temporary invoice access is ready.',
      includeAttachment: true,
    }),
  );
  assert(
    attachedNotice.error === 'policy_verification_failed',
    'The server rejects an invoice attachment prohibited by customer policy',
  );

  const noticeResult = await modelContext.executeTool(
    'send_access_notice',
    JSON.stringify({
      intentId: 'int_2841',
      contactId: 'contact_dana_lee',
      message: 'A one-hour read-only link is available for invoice INV-2841.',
      includeAttachment: false,
    }),
  );
  await flushSurfaceSync();
  assert(
    noticeResult.ok === true && noticeResult.outcomeReached === true,
    'A compliant no-attachment notice delivers the grant and reaches the outcome',
  );

  const mitigated = await api.getState();
  assert(mitigated.intent?.status === 'mitigated', 'Delivery mitigates rather than completes the intent');
  assert(
    mitigated.accessNoticeReceipt?.attachmentIncluded === false &&
      mitigated.accessNoticeReceipt.contactId === 'contact_dana_lee',
    'The server records the verified recipient and no-attachment delivery receipt',
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

  await intentRuntime.refreshFromServer();
  const firstStamp = intentRuntime.getAccessGrant()?.firstAccessedAt ?? null;
  assert(
    typeof firstStamp === 'string',
    'A recipient read stamps a server-authoritative first-access time',
  );
  await intentRuntime.readInvoiceByAccessToken(token);
  await intentRuntime.refreshFromServer();
  assert(
    intentRuntime.getAccessGrant()?.firstAccessedAt === firstStamp,
    'A repeated recipient read does not move the first-access time',
  );

  let secondGrantRejected = false;
  try {
    await intentRuntime.createScopedAccessGrant(
      'int_2841',
      'contact_dana_lee',
      60,
      'read_invoice_only',
      'I approve a replacement link.',
      'user',
    );
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
    names.includes('resume_intent') && names.includes('revoke_access_grant'),
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
    'revoke_access_grant',
    JSON.stringify({ intentId: 'int_2841', reason: 'The invoice was emailed after the repair shipped.' }),
  );
  await flushSurfaceSync();
  assert(revokeResult.revoked === true, 'The agent can revoke the workaround it issued');

  const revokedView = await intentRuntime.readInvoiceByAccessToken(token);
  assert(revokedView.success === false, 'A revoked share link stops resolving immediately');

  names = await toolNames(modelContext);
  assert(
    !names.includes('revoke_access_grant') && !names.includes('resume_intent'),
    'The dynamic surface returns to the base tools once nothing is outstanding',
  );

  // The judge can change policy without changing the failure, goal, or user request.
  await intentRuntime.resetDemo();
  await intentRuntime.setRecoveryScenario('portal_only');
  intentRuntime.createIntent(createInvoiceIntent());
  await intentRuntime.executeSendInvoiceWorkflow('int_2841');
  await flushSurfaceSync();

  const prohibitedGrant = await modelContext.executeTool(
    'create_scoped_access_grant',
    JSON.stringify({
      intentId: 'int_2841',
      contactId: 'contact_dana_lee',
      expirationMinutes: 30,
      scope: 'read_invoice_only',
      userConfirmation: 'I approve temporary invoice access.',
    }),
  );
  assert(
    prohibitedGrant.error === 'policy_verification_failed' && prohibitedGrant.message.includes('prohibits'),
    'Changing policy makes the previously valid external-link plan illegal',
  );

  const portalResult = await modelContext.executeTool(
    'upload_invoice_to_procurement_portal',
    JSON.stringify({ intentId: 'int_2841', contactId: 'contact_dana_lee' }),
  );
  assert(
    portalResult.ok === true && portalResult.via === 'procurement_portal',
    'The same failed outcome is recovered through a different plan under portal-only policy',
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
