# Heap 4: WebMCP pipeline contract

Heap 4 is a working vertical slice of one product promise:

> When a user workflow fails, preserve the outcome, expose current evidence and small capabilities, let an agent propose a route that was not packaged in advance, and verify every step server-side.

The governing invariant is:

> **A broken route is not a lost goal.**

And for the repair path specifically:

> **Narrow repair, broad validation, gradual exposure.**

## Outcomes and routes

An intent separates what the user needs from how the application happens to
deliver it:

```ts
goal: {
  outcome: 'Acme Corp can read invoice INV-2841 for $4,850',
  primaryRoute: 'email_delivery',
  alternateRoutes: ['secure_share_link', 'procurement_portal'],
}
```

When `email_delivery` breaks, the outcome is still reachable. That is the
difference between an agent that reports an incident and an agent that resolves
one. Two routes exist in this slice:

| | Route A: alternate route | Route B: engineering repair |
| --- | --- | --- |
| Who acts | browser agent, user scope | repair worker, repository scope |
| Time to outcome | seconds | review cycle |
| Fixes the defect | no | yes |
| Resulting status | `mitigated` | `resumable` then `completed` |
| Human approval | not required | required before deployment |

They are complementary, not alternatives. Route A gets the user unblocked; Route
B removes the defect. A slice with only Route B would leave the agent waiting on
engineers; a slice with only Route A would leave the bug in production.

## What WebMCP means here

WebMCP is the browser-side collaboration contract. The page registers tools on
the native `document.modelContext` object. A browser agent discovers those tools,
sends structured arguments, and the browser invokes the page callback in the
page's own authenticated context.

The server and repair worker do not depend on WebMCP to wake up. A server
failure automatically creates an interruption capsule and starts the repair
pipeline. WebMCP gives the user and agent a live, context-preserving window into
that state — and, critically, a set of actions that changes with it:

1. The page registers `list_active_intents`, `inspect_intent`,
   `add_user_context`, `request_repair`, `get_repair_status`, and
   `verify_intent` with names, descriptions, and JSON schemas.
2. The browser agent discovers those registrations through
   `document.modelContext.getTools()`.
3. The agent invokes a tool through the browser-mediated
   `document.modelContext.executeTool()` path.
4. The callback calls Heap 4's same-origin API and returns structured state.
5. Seven further tools register and deregister themselves as server state moves.

Heap 4 does not install a fake production `modelContext`. If the browser has no
native WebMCP support, the application still works as a normal site and clearly
reports that agent discovery is unavailable.

## The data boundary

WebMCP is chosen here for a structural reason, not a cosmetic one: the tool
executes inside the site's authenticated context, so credentials and raw
application state do not need to be exported to a separate MCP server. The
agent still receives whatever structured result the tool returns, and the share
link intentionally grants controlled access to its recipient.

- The page reads the invoice, failure capsule, and source context with the
  session the user already has.
- The agent receives only the structured result the site chose to return for
  that specific tool call.
- The application does not hand an agent vendor credentials or require a
  separate connector to hold raw workflow state.
- This demo does not use session state as training data. Session state lives in
  the demo session record and is discarded on reset.

Two things follow. First, each tool result is an explicit disclosure decision:
`inspect_intent` returns the grant's metadata but never its `tokenHash`, and
`create_scoped_access_grant` strips the plaintext URL from the audit log.
Second, the dynamic surface is an authorization-aware discovery boundary, not
the enforcement boundary. Because tools are registered from server-authoritative
state, the agent normally discovers only actions relevant to the current state;
stale tool handles and race conditions remain possible, so server-side checks
still decide whether a call succeeds.

An agent that drove the DOM instead would be limited to what happens to be
rendered, and a server-side connector would need its own credentials, its own
copy of the data, and its own authorization model.

## The dynamic capability surface

`onIntentStatusChange` is the only place dynamic registration happens, and it is
written as a pure projection of server-authoritative state onto a tool list:

| Server state | Policy/contact evidence | Recovery primitives | `revoke_access_grant` | `resume_intent` |
| --- | :---: | :---: | :---: | :---: |
| `active` | absent | absent | absent | absent |
| `blocked`, no grant | registered | create grant + attempt portal | absent | absent |
| `blocked`, live undelivered grant | registered | send notice + attempt portal | registered | absent |
| `mitigated` | registered | absent | if grant is live | absent |
| `resumable` | absent | absent | if grant is live | registered |
| `completed` | absent | absent | if grant is live | absent |

The properties this buys:

- The agent normally cannot discover an action that is invalid for the current
  state. Stale tool handles and race conditions remain possible, so every
  mutation still needs server-side enforcement.
- Each successful step changes the available next actions: grant creation gives
  way to notice delivery, and reaching the outcome withdraws recovery mutations.
- The revoke capability outlives completion, so a workaround is always
  retractable.
- Every mutation still re-checks its precondition server-side. The dynamic
  surface is a usability and safety affordance, not the enforcement boundary.

## The real end-to-end failure

The invoice flow uses the server service at
`src/server/services/DeliveryService.ts`:

1. The user starts sending invoice `INV-2841`.
2. The server creates and persists the invoice first.
3. The reproducible outbound-provider defect returns HTTP 500.
4. The server persists an interruption capsule containing request correlation,
   stack/source context, build, unfinished step, and protected invariants.
5. The server automatically creates a repair job with a sandbox plan.
6. A browser agent can inspect the interruption, reach the outcome by the
   alternate route, or attach user context while the pipeline proceeds.

This is not a client-only error banner. The direct service path, HTTP failure,
and persisted session state use the same failure boundary.

## Route A: agent-planned mitigation

No tool returns a recovery option or packages an alternate route. The agent
must combine four independent surfaces:

- `inspect_intent` supplies the desired postcondition, partial state, and invariants.
- `inspect_customer_delivery_policy` supplies the customer's natural-language policy as evidence.
- `list_authorized_contacts` supplies current people, roles, and notes without declaring action eligibility.
- `create_scoped_access_grant`, `send_access_notice`, and `upload_invoice_to_procurement_portal` are primitive mutations with explicit parameters and effects.

The default policy prefers the procurement portal but permits a temporary link
for a designated AP approver if the portal is unavailable. The portal tool then
returns a live `capability_execution_failed` result. The application does not
return a fallback plan. The agent must reinterpret the remaining evidence,
select Dana rather than the archival mailbox, determine a compliant duration
and scope, explain the disclosure change, obtain confirmation, then compose a
second primitive that delivers the grant without attaching the invoice.

For `create_scoped_access_grant`, the server independently enforces that:

- The intent is blocked and the original invoice exists exactly once.
- Current policy permits external links.
- The selected contact belongs to the customer, is active, and is eligible for external access.
- The scope is exactly `read_invoice_only`.
- The requested integer duration does not exceed the policy maximum.
- Explicit confirmation exists and no usable grant is already outstanding.

Creating the grant does not satisfy the outcome. It only creates authority and
leaves the intent blocked. For `send_access_notice`, the server independently
enforces that a usable grant exists, the recipient matches its audience, policy
requires notice delivery, the message has valid content, and no prohibited
invoice attachment is included. A successful notice records a receipt and moves
the intent to `mitigated`.

The portal primitive independently verifies policy, contact eligibility,
artifact identity, and live channel availability. Under the selectable
`portal_only` policy, external links are prohibited and the portal is available,
so the same failed intent and user request require a different valid plan.

Neither mitigation marks email as sent, changes the amount, creates a second
invoice, repairs the defect, or moves the intent to `completed`. A share token
is stored only as a SHA-256 digest, returned once, and revocable through
`revoke_access_grant`. The session-free recipient endpoint stamps
`firstAccessedAt` on first successful resolution.

## Route B: repair pipeline and sandbox boundary

Every repair job declares:

- The exact source revision that failed.
- The small writable file scope for the permitted repair class.
- The larger validation scope for affected consumers, candidate parsing, and the write-scope audit.
- A job-scoped ephemeral workspace.
- Deny-by-default network access in the Cloudflare VM; fixed no-network commands and no inherited credentials locally.
- Cleanup after artifact capture.

The executor runs the same stages against a real, job-scoped workspace:

`queued → diagnosing → reproducing → patching → validating → ready_for_review`

The artifact is not reviewable until the original failure reproduces against the
base fixture, the regression assertion passes against the candidate, affected
workflow invariants pass, the candidate parses, and the scope audit passes.

In localhost development the executor uses Node's permission model, fixed argv
commands, a reduced environment, and a temporary workspace. In a Cloudflare
deployment it uses the RepairSandbox container class, with public internet
disabled and no repository or provider credentials in the VM. Both adapters
capture stdout, stderr, exit codes, timestamps, SHA-256 evidence digests, and
cleanup state. The source mutation is limited to the allowlisted delivery
adapter path; the harness files are written by the trusted executor.

The local adapter is the fully exercised hackathon runtime. The Cloudflare
adapter and RepairSandbox Durable Object are wired for deployment, but a
Cloudflare VM is not started by npm run dev; deployment requires the
Cloudflare container runtime and its configured D1/Durable Object bindings.
The Worker currently schedules the bounded run with ctx.waitUntil, which is
appropriate for this short vertical slice. A production version should move
longer or retryable repair orchestration into Workflows (or a queue-backed
worker) while keeping this same executor contract and evidence envelope.

The current repair class is deliberately bounded to the stateless provider
adapter. It cannot change schemas, authentication, infrastructure, CI,
dependencies, invoice amounts, or idempotency behavior.

## Repair, delivery, and user agency

The agent may observe the repair job and add context, but repository and
deployment authority stay outside the browser. A candidate must have all
validation checks passing before the engineering review surface can promote it.

Promotion records deployment evidence: candidate build, smoke-test result,
canary result, and rollback readiness. Only then does the server mark the intent
`resumable` and the page dynamically register `resume_intent`. A mitigated
intent is promotable too: a live workaround never blocks the real fix, and
deploying the fix never silently revokes the workaround.

Resume runs only the unfinished delivery step. The server still enforces that:

- The intent is resumable.
- The original invoice exists.
- The invoice amount is unchanged.
- Exactly one invoice record exists.
- Deployment smoke and canary evidence passed.

Once the primary route succeeds, `progress.goalSatisfiedVia` moves from
`secure_share_link` to `email_delivery`, and the agent can revoke the link it
issued earlier. The final `verify_intent` tool reads server-authoritative state
and reports the outcome, the route that reached it, whether the primary route
was actually repaired, any outstanding grant, and the no-duplicate invariant.

## Acceptance checklist

- Start from `demo-build-a` and send the invoice.
- Observe the real HTTP 500 and source context at `DeliveryService.ts:42`.
- Reload and confirm the blocked intent persists.
- Discover the base WebMCP tools plus policy evidence, contacts, and both recovery primitives.
- Keep **Portal outage** selected and give the agent an outcome plus natural-language constraints.
- Confirm it reads policy and contacts, attempts the preferred portal, observes the outage, and replans.
- Confirm the server rejects the archival contact and any duration over the policy maximum.
- Approve the agent's compliant grant for Dana; confirm the invoice is still not sent, the amount is unchanged, and the status remains `blocked`.
- Confirm `send_access_notice` appears, rejects the archival mailbox and an attached invoice, then accepts a compliant no-attachment notice for Dana.
- Confirm only notice delivery changes the status to `mitigated`.
- Open the returned link and confirm the scoped recipient view.
- Confirm grant creation is withdrawn after minting, notice delivery is withdrawn after sending, and `revoke_access_grant` remains available.
- Reset, select **Portal only**, repeat the same failure and user request, and confirm the grant is denied while portal delivery succeeds.
- Watch Engineering Review progress from sandbox creation through validation,
  including the command transcripts and write-scope audit.
- Confirm the job stops at `ready_for_review` until promotion.
- Promote the validated candidate and inspect deployment evidence.
- Discover the temporary `resume_intent` tool.
- Resume and verify the invoice is sent exactly once.
- Revoke the share link and confirm it stops resolving.
- Confirm the dynamic surface returns to the six base tools.

The startup expansion can add repository connectors, screenshots, log ingestion,
CI providers, real pull requests, further bounded repair classes, and further
alternate routes behind the same contracts. WebMCP remains the in-browser
interface through which the user's agent understands and continues the live
workflow.

## Deployment hardening boundary

The demo session header is a correlation mechanism, not user authentication.
Before exposing a multi-tenant deployment, add authenticated session
middleware, workspace/role checks, tenant-bound D1 queries, rate limits, and
audit logging around every repair and deployment route. Share-link issuance in
particular should be rate limited and recorded in a tamper-evident audit trail,
since it is the one agent-reachable capability that grants a third party read
access. The browser agent is deliberately unable to reach the sandbox directly;
it only receives the server-authorized WebMCP view of the interruption.
