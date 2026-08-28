# Heap 4: WebMCP pipeline contract

Heap 4 is a working vertical slice of one product promise:

> When a user workflow fails, preserve the unfinished intent, start a bounded engineering repair, validate it broadly, expose the deployment evidence, and let the browser agent continue only the missing step.

The governing invariant is:

> **Narrow repair, broad validation, gradual exposure.**

## What WebMCP means here

WebMCP is the browser-side collaboration contract. The page registers tools on
the native `document.modelContext` object. A browser agent discovers those tools,
sends structured arguments, and the browser invokes the page callback in the
page's own authenticated context.

The server and repair worker do not depend on WebMCP to wake up. A server
failure automatically creates an interruption capsule and starts the repair
pipeline. WebMCP gives the user and agent a live, context-preserving window into
that pipeline:

1. The page registers `list_active_intents`, `inspect_intent`,
   `add_user_context`, `request_repair`, `get_repair_status`, and
   `verify_intent` with names, descriptions, and JSON schemas.
2. The browser agent discovers those registrations through
   `document.modelContext.getTools()`.
3. The agent invokes a tool through the browser-mediated
   `document.modelContext.executeTool()` path.
4. The callback calls Heap 4's same-origin API and returns structured state.
5. `resume_intent` is registered only after deployment evidence passes and the
   intent is resumable. It is removed again after completion.

Heap 4 does not install a fake production `modelContext`. If the browser has no
native WebMCP support, the application still works as a normal site and clearly
reports that agent discovery is unavailable.

## The real end-to-end failure

The invoice flow uses the server service at
`src/server/services/DeliveryService.ts`:

1. The user starts sending invoice `INV-2841`.
2. The server creates and persists the invoice first.
3. The reproducible outbound-provider defect returns HTTP 500.
4. The server persists an interruption capsule containing request correlation,
   stack/source context, build, unfinished step, and protected invariants.
5. The server automatically creates a repair job with a sandbox plan.
6. A browser agent can inspect the interruption or attach user context while the
   engineering pipeline proceeds in the background.

This is not a client-only error banner. The direct service path, HTTP failure,
and persisted session state use the same failure boundary.

## Repair pipeline and sandbox boundary

Every repair job declares:

- The exact source revision that failed.
- The small writable file scope for the permitted repair class.
- The larger validation scope for affected consumers and the complete build.
- A job-scoped ephemeral workspace.
- Deny-by-default network access and brokered credentials.
- Cleanup after artifact capture.

The deterministic challenge implementation advances through these stages:

`queued → diagnosing → reproducing → patching → validating → ready_for_review`

The artifact is not reviewable until the original failure reproduces against the
base revision, the regression assertion passes against the candidate, affected
workflow checks pass, and the full application build succeeds.

The current repair class is deliberately bounded to the stateless provider
adapter. It cannot change schemas, authentication, infrastructure, CI,
dependencies, invoice amounts, or idempotency behavior.

## Repair, delivery, and user agency

The agent may observe the repair job and add context, but repository and
deployment authority stay outside the browser. A candidate must have all
validation checks passing before the engineering review surface can promote it.

Promotion records deployment evidence: candidate build, smoke-test result,
canary result, and rollback readiness. Only then does the server mark the intent
`resumable` and the page dynamically register `resume_intent`.

Resume runs only the unfinished delivery step. The server still enforces that:

- The intent is resumable.
- The original invoice exists.
- The invoice amount is unchanged.
- Exactly one invoice record exists.
- Deployment smoke and canary evidence passed.

The final `verify_intent` tool reads server-authoritative state and confirms the
original goal plus the no-duplicate invariant.

## Acceptance checklist

- Start from `demo-build-a` and send the invoice.
- Observe the real HTTP 500 and source context at `DeliveryService.ts:42`.
- Reload and confirm the blocked intent persists.
- Discover the base WebMCP tools, including `add_user_context`.
- Ask the browser agent what happened and optionally attach context.
- Watch Engineering Review progress from sandbox creation through validation.
- Confirm the job stops at `ready_for_review` until promotion.
- Promote the validated candidate and inspect deployment evidence.
- Discover the temporary `resume_intent` tool.
- Resume and verify the invoice is sent exactly once.
- Confirm `resume_intent` is removed after completion.

The startup expansion can add repository connectors, screenshots, log ingestion,
CI providers, real pull requests, and additional bounded repair classes behind
the same contracts. WebMCP remains the in-browser interface through which the
user's agent understands and continues the live workflow.
