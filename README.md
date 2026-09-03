# Heap 4

**An open-world recovery runtime: applications expose outcomes, evidence, primitive capabilities, and invariants; an agent proposes a workflow that Heap 4 verifies one step at a time.**

Developers define what is legal. The agent discovers what will work.

## What the agent actually does — and doesn't do

The agent performs **semantic planning, not authorization**. It reads a natural-language customer policy, distinguishes an acting approver from an archival mailbox, selects primitive actions and parameters, asks for narrowly scoped confirmation when disclosure changes, observes execution, and replans when a capability fails. Heap 4 independently enforces the selected contact, scope, expiration, confirmation, channel policy, workflow state, and invoice invariants.

Heap 4 never treats the model's policy interpretation as authority. A model may propose a one-hour grant for Dana; the server accepts it only if the current policy permits external links, Dana is eligible, the requested scope is exact, and the duration is within the configured maximum. Invalid proposals become structured observations the agent can use to revise its plan.

An LLM is not mathematically necessary. A symbolic planner could solve the same problem if every future policy, preference, semantic relationship, precondition, and effect were formalized. Heap 4 targets the open-world case where those combinations cannot reasonably be enumerated when the application is built. WebMCP makes the current capabilities discoverable; the model handles semantic search over possible compositions; deterministic software retains authority.

The demo proves the distinction by holding the failure, outcome, and user request constant while changing customer policy. Under the default policy, the agent attempts the preferred procurement portal, observes that it is unavailable, and replans to a confirmed temporary grant for Dana. Under the portal-only policy, that same grant is rejected and the portal action succeeds. There is no `get_recovery_options`, `recover_invoice`, or packaged alternate-delivery tool containing the answer.

## The thesis

A broken route is not a lost goal.

Most error handling conflates the two. "Send invoice" fails, so the workflow is dead until an engineer ships a fix. But the user's actual goal was *"Acme Corp can read invoice INV-2841"* — email was only the route. Heap 4 models that split explicitly, which lets a browser agent do something more useful than watch a status page.

```text
outcome:  Acme Corp can read invoice INV-2841
  ├─ route: email_delivery             ← broken at DeliveryService.ts:42
  ├─ capability: procurement_portal    ← preferred, may fail at execution
  └─ capability: scoped_access_grant   ← parameterized and policy-verified
```

## This invoice is one instance, not the whole claim

The *pattern* here isn't invoice-specific. It's four pieces, defined generically in [intentTypes.ts](src/client/heap/intentTypes.ts) and [registerTools.ts](src/client/webmcp/registerTools.ts):

- an `IntentStatus` lifecycle (`active → blocked → mitigated/resumable → completed`) that isn't about email at all,
- a `GoalRoute` split between what the user needs and how it happens to be delivered,
- `onIntentStatusChange`'s dynamic tool gating, which reads intent status and grant state, not invoice fields,
- a capability-grant shape (scoped, expiring, revocable, access-tracked) that isn't about invoices either.

Being precise about what that buys today: two invoice recovery capabilities are implemented (`secure_share_link` and `procurement_portal`), with two selectable customer-policy scenarios. Their transitions are still hardcoded against `state.invoice`; this is not yet a generic domain planner. `Intent.kind` also contains `'export_report'`, but it remains a type-level stub with no transition logic.

The honest claim is that the planner/verifier boundary generalizes: a new domain must supply its own primitive actions, state projections, and deterministic verifiers. Heap 4 does not infer safe server mutations from prose.

## The dynamic tool surface

Heap 4's registered tools are a projection of server state. While an intent is blocked, WebMCP exposes policy and contact evidence plus the `create_scoped_access_grant` and `upload_invoice_to_procurement_portal` primitives. Once one succeeds, both creation capabilities disappear. `revoke_access_grant` exists only while a usable grant is outstanding, and `resume_intent` exists only after a reviewed repair is deployed.

The tool surface is state-gated, but policy remains server-enforced. Coarse lifecycle-invalid actions do not exist in the schema; parameter-level mistakes and races are still rejected by the server.

This is a HATEOAS-style property applied to tools instead of hypermedia links: valid next actions are discoverable from the current state, and invalid ones are structurally absent rather than merely discouraged by a system prompt. Most agent stacks dump every tool definition into the prompt and rely on the model not to call one out of sequence. Here, an out-of-sequence call isn't a prompting failure to guard against \u2014 the tool doesn't exist yet.

The mitigated state is also not just a nicer error screen. A static "email failed, click for a link instead" modal treats the failure as terminal: once clicked, the app has no further relationship to the original goal, and the link tends to outlive its usefulness. Heap 4 treats it as a degraded state in an open reconciliation loop \u2014 issue an ephemeral, revocable capability, keep polling repair status in the background (`intentRuntime`'s `repairPollTimer`, already running, not aspirational), and once the primary route heals, complete it and withdraw the workaround without being asked twice. `revoke_alternate_delivery` staying registered through `resumable` is what that teardown step looks like in the tool surface.

One claim worth qualifying rather than asserting: because the tool executes in the page's own session, a production deployment's per-user authorization would apply to the agent automatically \u2014 no separate credential to provision, no separate permission model to keep in sync. That's a real architectural property of WebMCP. It is *not* something this demo exercises: `getDemoSessionId()` is a single pseudo-session with no login system and no per-user role model, so there's nothing here to test that claim against yet.

## The vertical slice

1. A user sends invoice `INV-2841` for $4,850.
2. The server persists exactly one invoice, then executes a reproducible delivery-provider defect and returns HTTP 500.
3. Heap 4 stores the outcome, the routes that could reach it, partial progress, request ID, build, stack, source location, and protected invariants.
4. A browser agent enters cold, discovers the interrupted workflow, and finds it can act — not just report.
5. The agent reads customer policy and candidate contacts, then attempts the policy-preferred procurement portal primitive.
6. The portal reports an unexpected outage. No fallback plan was returned by the application.
7. The agent interprets the remaining policy, selects Dana rather than the archival mailbox, proposes a 60-minute invoice-only grant, and obtains explicit confirmation.
8. The server verifies every parameter and mints the scoped capability. The intent becomes `mitigated`, not `completed`.
9. In parallel, a bounded repair job reaches `ready_for_review`; a human promotes it.
10. `resume_intent` appears. The agent completes only the missing primary delivery step, verifies the outcome, and revokes the temporary grant.

The website never edits its own source, and the browser agent never receives repository or deployment authority.

See [WEBMCP_PIPELINE.md](WEBMCP_PIPELINE.md) for the exact contract, authority boundaries, and acceptance checklist.

## WebMCP tools

Base surface, always registered:

- `list_active_intents` — discover unfinished human workflows.
- `inspect_intent` — outcome, available routes, partial state, invariants, failure, source, grant, repair.
- `add_user_context` — attach a concise clarification to the interruption capsule.
- `request_repair` — refresh or explicitly request the bounded repair job.
- `get_repair_status` — observe repair, deployment, and resumability state.
- `verify_intent` — verify the outcome, which route reached it, and the no-duplicate invariant.

Dynamic surface, registered only while the server would authorize it:

- `inspect_customer_delivery_policy` — return natural-language policy evidence, not a recovery plan.
- `list_authorized_contacts` — return candidate contacts and business roles, not action eligibility.
- `create_scoped_access_grant` — request a contact, duration, scope, and confirmation for independent verification.
- `upload_invoice_to_procurement_portal` — attempt portal delivery and return live execution evidence, including outages.
- `revoke_access_grant` — withdraw a temporary capability.
- `resume_intent` — run only the unfinished step after an approved repair is deployed.

Production registration is forwarded to the browser's real `document.modelContext.registerTool(...)`. The in-memory implementation in `src/webmcp/modelContext.ts` is installed by tests only and never attached to `document`, `window`, or `navigator`.

## The share link is a real capability

Not a decorative URL. The alternate route mints a bearer token that is:

- **scoped** — reads one invoice, projected to `read_invoice_only` fields.
- **expiring** — one hour, enforced server-side.
- **revocable** — revocation stops resolution immediately.
- **never stored in plaintext** — only its SHA-256 digest is persisted; the URL is returned once, at issue time, and is excluded from the tool audit log.
- **session-free** — the recipient is not the authenticated user, so authority comes from the token's scope rather than a session. This is why `GET /api/demo/invoice-access/:token` is deliberately unauthenticated.

## Why WebMCP and not a scraper or a server connector

The tool executes *inside the site's authenticated context*, so credentials and raw application state do not need to be exported to a separate MCP server. The agent still receives whatever structured result the tool returns, and the share link intentionally grants controlled access to its recipient.

That has three consequences worth stating plainly:

- **A DOM-driving agent cannot do this.** It would have to see the rendered page to act on it, and it would still only know what is on screen — not the outcome, the invariants, or which routes remain open.
- **A server-side MCP connector cannot do this cheaply.** It needs its own credentials, its own copy of the data, and its own authorization model. Here the browser already has the user's session, and the site already knows what the user is allowed to do.
- **Nothing is retained for training.** State stays in the user's session record and is discarded on reset. The site chooses what to expose per tool call; the plaintext share URL, for example, is returned once and excluded from the audit log.

The tool surface is an authorization-aware discovery boundary, not the enforcement boundary. Because tools are registered from server-authoritative state, the agent normally discovers only actions relevant to the current state; server-side checks still decide whether a stale or racing call succeeds.

## Why not just automatic failover?

Load balancers, retries, and circuit breakers already fail over automatically, and they should keep doing that here too. The line between "keep it automatic" and "ask first" is a concrete question, not a vibe:

> **Does the substitute change who can see the data, what they can see, or how long they can see it?**

Ordinary failover answers no. The same email goes to the same inbox whether it was sent from node A or node B — the recipient, the content, and the access model are identical. Nothing about the disclosure changed, so no judgment call is needed. It should stay fully automatic, with no agent involved.

The alternate route here answers yes. Email lands permanently in an inbox; the share link is a revocable, time-boxed, read-only URL. Different access model, different exposure window, different party trusted with it. Swapping one for the other is a disclosure decision, not a routing decision, and disclosure decisions need a decision-maker at the moment they're made — not just an operator's default from months earlier.

That is why the agent must explain its proposed disclosure change and obtain confirmation before calling `create_scoped_access_grant`. The site does not prescribe that solution, but it still enforces the contact, scope, expiry, confirmation, and current state before issuing anything.

## Authority boundaries

```text
Browser agent                Engineering worker
user/application scope       repository scope
        │                           │
        ├── reach the outcome       ├── propose a patch
        │   by an allowlisted       │
        │   alternate route         │
        │                           │
        └────── Heap intent ────────┘
                     │
            explicit human approval
                     │
                 deployment
                     │
              WebMCP safe resume
```

The agent can inspect, mitigate, revoke, resume, and verify — all within user scope. Only explicit human approval changes the deployed build.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. For native WebMCP testing, use ChatGPT's in-app browser or enable `chrome://flags/#enable-webmcp-testing` in a supported Chrome build.

The URL receives a `session` query parameter. Keep that parameter when moving the demo between browser surfaces; it identifies the same server-side interrupted workflow without exposing user data.

## Public demo

The standalone free-tier deployment is available at [heap4-webmcp-demo.jorge-leonardo-ruizwilliams.workers.dev](https://heap4-webmcp-demo.jorge-leonardo-ruizwilliams.workers.dev). Its Worker and D1 configuration live in [cloudflare-demo](cloudflare-demo), separate from the original Container-capable deployment in `wrangler.jsonc`.

Because Cloudflare Workers Free does not include Containers, the public demo uses an explicit edge evidence runner with fixed, allowlisted deterministic checks. The local deployment exercises the bounded process adapter, while the original Cloudflare Worker remains wired for the Container sandbox when its paid-plan bindings are configured.

## Native WebMCP acceptance flow

1. Click **Reset Demo Baseline**.
2. Click **Send invoice** and confirm the HTTP 500 state.
3. Close the recovery drawer and navigate to another area.
4. Ask the browser agent: **“What happened to what I was doing?”**
5. In **Policy Gate**, select **Portal outage** and read the policy without changing the goal or failure.
6. Ask: **“Get Acme the invoice before their review. Don't give anyone permanent access, and don't make me babysit it.”**
7. Confirm the agent inspects policy and contacts, attempts `upload_invoice_to_procurement_portal`, observes the outage, and replans.
8. Approve the proposed one-hour grant for Dana. Confirm `create_scoped_access_grant` returns a link and `revoke_access_grant` replaces both creation tools.
9. Open the link and confirm the recipient view plus live `firstAccessedAt`.
10. Reset and select **Portal only**. Repeat the same failure and request; confirm an external grant is rejected while portal upload succeeds.
11. Open **Engineering Review**, approve the validated candidate, resume the missing primary step, and revoke any temporary grant.

If the page reports that native WebMCP is unavailable, the normal application still works, but that browser is not a valid acceptance environment. Heap 4 intentionally does not install a JavaScript `modelContext` polyfill.

## Verification

```bash
npm test
npm run build
```

The suite proves the real delivery failure, persisted interruption, policy/contact evidence, archival-contact and excessive-expiry rejection, unexpected portal failure, successful replanning to a scoped grant, policy-switched portal delivery, capability-token security, dynamic tool lifecycle, human-gated repair, invariant-safe resume, and server-authoritative outcome verification.

## License

Apache-2.0. See [LICENSE](LICENSE).
