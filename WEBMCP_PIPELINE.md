# Heap 4: WebMCP pipeline contract

Heap 4 is a working vertical slice of one product promise:

> When a user's workflow fails, preserve what they were doing, let their browser agent understand the failure, require a human-approved repair, and let the user continue without repeating successful steps.

## What WebMCP means here

WebMCP is the browser-side tool contract. The page registers tools on the native
`document.modelContext` object. A browser agent discovers those tools, sends
structured arguments, and the browser invokes the page's callback in the page's
own authenticated context.

That makes Heap 4 WebMCP in a concrete way:

1. The page registers `list_active_intents`, `inspect_intent`, `request_repair`,
   `get_repair_status`, and `verify_intent` with names, descriptions, and JSON
   schemas.
2. ChatGPT's in-app browser (or a WebMCP-enabled Chrome build) discovers those
   registrations through `document.modelContext.getTools()`.
3. The agent invokes a tool through the browser's mediated
   `document.modelContext.executeTool()` path.
4. The callback calls Heap 4's same-origin API, updates the page, and returns a
   structured result to the agent.
5. `resume_intent` is registered only after a human approves and deploys the
   repair. It is removed again after completion.

Heap 4 does not install a fake production `modelContext`. If the browser has no
native WebMCP support, the application still works as a normal site and clearly
reports that agent discovery is unavailable.

## The real end-to-end failure

The invoice flow uses an actual server service at
`src/server/services/DeliveryService.ts`:

1. The user starts sending invoice `INV-2841`.
2. The server creates and persists the invoice first.
3. `demo-build-a` executes a reproducible outbound-provider configuration bug
   and returns HTTP 500.
4. The server persists a failure capsule containing the request ID, route,
   stack, build, source file/line, and unfinished step.
5. A new page load restores the same blocked intent from the server store.

This is not a client-only error banner. The direct service test, the HTTP flow,
and the persistence tests all exercise the same failure boundary.

## Repair and user agency

The agent may inspect the failure and request a bounded repair artifact. It
cannot deploy that artifact because deployment is deliberately not a WebMCP
tool. The user opens Engineering Review and explicitly approves the patch.

The server then changes the active build to `demo-build-b` and marks the intent
`resumable`. Only then does the page dynamically register `resume_intent`.
The agent can invoke it, but the server still enforces that:

- the intent is resumable;
- the original invoice exists;
- the invoice amount is unchanged; and
- exactly one invoice record exists.

Resume runs only the missing delivery step. The final `verify_intent` tool reads
server-authoritative state and confirms the original goal plus the no-duplicate
invariant. Once complete, `resume_intent` is removed from the tool surface.

## What is deliberately bounded for the challenge

The delivery provider is a deterministic local fixture, so the challenge has a
repeatable real failure instead of relying on an external email service. The
repair artifact and build switch are deterministic but reviewable: they model
the future PR/deploy worker without pretending that an untrusted browser agent
can edit an arbitrary production repository.

The startup expansion can add repository connectors, screenshots, log and
source ingestion, CI validation, and real pull requests behind the same human
approval boundary. Those are product layers; WebMCP remains the in-browser
interface through which the user's agent understands and continues the live
workflow.

## Acceptance checklist

- Start from `demo-build-a` and send the invoice.
- Observe the real HTTP 500 and source context at `DeliveryService.ts:42`.
- Reload and confirm the blocked intent persists.
- Discover five base WebMCP tools.
- Inspect the failure and request a repair through the agent.
- Approve deployment in Engineering Review.
- Discover the sixth, temporary `resume_intent` tool.
- Resume and verify the invoice is sent exactly once.
- Confirm the tool surface returns to five tools.
