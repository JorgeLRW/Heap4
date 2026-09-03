# Heap 4

**A state-aware capability runtime: web applications expose dynamic, state-gated tool surfaces that any WebMCP agent can discover in-session, navigate through degraded mitigation states, and reconcile once the primary route heals.**

We don't use an LLM to invent business logic — that belongs in a deterministic, server-side state machine. Heap 4 is that state machine, plus the WebMCP surface that lets any compliant agent reach it without a bespoke integration.

## What the agent actually does — and doesn't do

Be precise about this, because it's easy to overclaim: **the agent makes zero policy decisions.** Every constraint — the allowlist, the scope, the expiry, the duplicate-issuance check, the confirmation requirement — is enforced server-side, identically whether the caller is an LLM, a script, or a curl command. Trace an actual call: `get_recovery_options` is a read. `deliver_by_alternate_route` takes a confirmation string and then re-validates status, allowlist, and invariants regardless of what that string says. The agent's job is translation — structured state into a conversation, a user's answer back into the next call — not reasoning about what's allowed.

That is deliberate, not a limitation to apologize for. Non-deterministic behavior around data disclosure and capability grants is a liability, not a feature; a security or compliance reviewer should be relieved, not disappointed, that the LLM cannot invent a route. If you could replace the agent with a Temporal workflow, a Step Functions saga, and a Slack approval card and lose nothing — you're right, and for a single app with the user present, you should. A two-button web notification resolves this exact scenario with less latency, no token cost, and no prompt-injection surface.

So why involve an agent at all? Because the actual moat isn't reasoning — it's the $N \times M$ integration problem. If fifty SaaS vendors each build their own failure-recovery workflow, a user coordinating across them needs fifty bespoke dashboards, notification schemes, and webhook endpoints. WebMCP is a standard, in-session contract for *discovering* an interrupted intent and its currently-authorized recovery capabilities — reachable by any compliant agent, with no per-vendor connector. That's a protocol claim, not an intelligence claim.

There is one place a general agent adds something a static two-button card structurally cannot: answering open-ended follow-up questions grounded in the same state data the tools already return — "what timezone does this expire in," "can they forward this link to someone else," "has Acme already opened it." A card can't have that conversation without the site author hand-coding an FAQ for every edge case; an LLM reading `get_recovery_options`/`inspect_intent` output can. That last question isn't rhetorical here — the share grant tracks a real `firstAccessedAt` timestamp server-side precisely so the answer is a fact, not a guess.

## The thesis

A broken route is not a lost goal.

Most error handling conflates the two. "Send invoice" fails, so the workflow is dead until an engineer ships a fix. But the user's actual goal was *"Acme Corp can read invoice INV-2841"* — email was only the route. Heap 4 models that split explicitly, which lets a browser agent do something more useful than watch a status page.

```text
outcome:  Acme Corp can read invoice INV-2841
  ├─ route: email_delivery      ← broken at DeliveryService.ts:42
  └─ route: secure_share_link   ← allowlisted, available right now
```

## This invoice is one instance, not the whole claim

The *pattern* here isn't invoice-specific. It's four pieces, defined generically in [intentTypes.ts](src/client/heap/intentTypes.ts) and [registerTools.ts](src/client/webmcp/registerTools.ts):

- an `IntentStatus` lifecycle (`active → blocked → mitigated/resumable → completed`) that isn't about email at all,
- a `GoalRoute` split between what the user needs and how it happens to be delivered,
- `onIntentStatusChange`'s dynamic tool gating, which reads intent status and grant state, not invoice fields,
- a capability-grant shape (scoped, expiring, revocable, access-tracked) that isn't about invoices either.

Being precise about what that buys today, rather than overselling it: only one `GoalRoute` pair is actually implemented (`email_delivery` / `secure_share_link`), and the transition that grants access — `grantAlternateAccessTransition` in [demoTransitions.ts](src/shared/demoTransitions.ts) — is hardcoded against `state.invoice`, not a generic entity. `IntentGoal.kind` even has a second value, `'export_report'`, sitting in the type union — but it's a stub with zero logic behind it, not a second working workflow. I'm flagging that here so nobody has to find it and wonder if it's a hidden feature; it isn't.

So the honest claim is: the lifecycle, the gating mechanism, and the grant shape would carry over to a different failure — a report export that times out, a payment that declines, a calendar invite that can't send — because none of that logic is written in terms of invoices. Wiring up a second route or a second `kind` is new code, not a config flag. This repo proves the mechanism once, completely, rather than proving it shallowly five times.

## The dynamic tool surface

This is the part that is native to WebMCP and impossible in a static tool manifest. Heap 4's registered tools are a pure function of server state:

| Server state | `get_recovery_options` | `deliver_by_alternate_route` | `revoke_alternate_delivery` | `resume_intent` |
| --- | :---: | :---: | :---: | :---: |
| `active` — nothing wrong | absent | absent | absent | absent |
| `blocked` — primary route broken | **registered** | **registered** | absent | absent |
| `mitigated` — link live, defect open | absent | absent | **registered** | absent |
| `resumable` — repair deployed | absent | absent | **registered** | **registered** |
| `completed` — nothing outstanding | absent | absent | absent | absent |

The agent normally cannot discover an action that is invalid for the current state. Stale tool handles and race conditions remain possible, so every mutation still needs server-side enforcement. `deliver_by_alternate_route` withdraws itself after a link exists, while the server also rejects duplicate issuance. `revoke_alternate_delivery` persists past completion, so a workaround is always retractable.

This is a HATEOAS-style property applied to tools instead of hypermedia links: valid next actions are discoverable from the current state, and invalid ones are structurally absent rather than merely discouraged by a system prompt. Most agent stacks dump every tool definition into the prompt and rely on the model not to call one out of sequence. Here, an out-of-sequence call isn't a prompting failure to guard against \u2014 the tool doesn't exist yet.

The mitigated state is also not just a nicer error screen. A static "email failed, click for a link instead" modal treats the failure as terminal: once clicked, the app has no further relationship to the original goal, and the link tends to outlive its usefulness. Heap 4 treats it as a degraded state in an open reconciliation loop \u2014 issue an ephemeral, revocable capability, keep polling repair status in the background (`intentRuntime`'s `repairPollTimer`, already running, not aspirational), and once the primary route heals, complete it and withdraw the workaround without being asked twice. `revoke_alternate_delivery` staying registered through `resumable` is what that teardown step looks like in the tool surface.

One claim worth qualifying rather than asserting: because the tool executes in the page's own session, a production deployment's per-user authorization would apply to the agent automatically \u2014 no separate credential to provision, no separate permission model to keep in sync. That's a real architectural property of WebMCP. It is *not* something this demo exercises: `getDemoSessionId()` is a single pseudo-session with no login system and no per-user role model, so there's nothing here to test that claim against yet.

## The vertical slice

1. A user sends invoice `INV-2841` for $4,850.
2. The server persists exactly one invoice, then executes a reproducible delivery-provider defect and returns HTTP 500.
3. Heap 4 stores the outcome, the routes that could reach it, partial progress, request ID, build, stack, source location, and protected invariants.
4. A browser agent enters cold, discovers the interrupted workflow, and finds it can act — not just report.
5. **Route A (seconds, user-confirmed):** the agent calls `get_recovery_options`, explains the safe route, and receives the user's explicit confirmation. It then calls `deliver_by_alternate_route`. The server records the approved route but not the user's words, and mints a scoped, expiring, revocable share link. Acme can read the invoice now. The invoice is *not* marked sent, the amount is untouched, no second invoice exists, and the defect is still open. The intent becomes `mitigated`, not `completed`.
6. **Route B (in parallel):** a bounded repair job reproduces the failure in a job-scoped sandbox, produces a patch, runs the affected checks and a write-scope audit, and waits at `ready_for_review`.
7. A human reviews the validated artifact and promotes the candidate.
8. `resume_intent` appears. The agent runs only the missing delivery step and verifies the invoice was sent without duplication.
9. The agent revokes the link it issued. The share URL stops resolving immediately.

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

- `get_recovery_options` — explain the outcome, approved recovery routes, constraints, and confirmation requirement without making a change.
- `deliver_by_alternate_route` — after explicit user confirmation, reach the outcome another way while the primary route is broken.
- `revoke_alternate_delivery` — withdraw the workaround capability.
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

That is why the flow is three separate steps instead of one automatic branch: `get_recovery_options` explains what would change about who can see the invoice and for how long, the user gives an explicit confirmation, and only then does `deliver_by_alternate_route` mint the capability. The site still defines and enforces what's allowed at all — the allowlist, the scope, the expiry — the same way an operator defines valid failover targets. What's added is the one gate that matters: confirming that *this specific change in who can see the data* is acceptable *this time*.

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
5. Confirm `list_active_intents`, `inspect_intent`, and `deliver_by_alternate_route` appear in the WebMCP inspector.
6. Ask: **“Can you get it to them another way?”** Confirm a share link is returned, the invoice still reads *not sent*, and the status becomes `mitigated`.
7. Open the returned link and confirm the recipient view renders the invoice.
8. Confirm `deliver_by_alternate_route` is gone and `revoke_alternate_delivery` has appeared.
9. Open **Engineering Review**, watch sandbox evidence reach `ready_for_review`, then approve promotion.
10. Ask: **“Can you finish it now?”** Confirm `resume_intent` runs, the invoice becomes sent, and no duplicate exists.
11. Ask: **“The email went out — revoke that link.”** Confirm the share URL stops resolving and the dynamic surface returns to the six base tools.

If the page reports that native WebMCP is unavailable, the normal application still works, but that browser is not a valid acceptance environment. Heap 4 intentionally does not install a JavaScript `modelContext` polyfill.

## Verification

```bash
npm test
npm run build
```

The suite proves the real delivery-service failure, HTTP 500 capsule, server persistence, blocked-state guard, real local command execution, SHA-256 evidence, write-scope enforcement, cleanup, review requirement, the full dynamic capability lifecycle across all five intent states, capability-token scope and revocation, tamper rejection, invariant-safe mitigation and resume, and server-authoritative outcome verification.

## License

Apache-2.0. See [LICENSE](LICENSE).
