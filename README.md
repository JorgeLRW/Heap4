# Heap 4

**A website that remembers what you were trying to do, and hands your agent exactly the capabilities that can still finish it.**

Heap 4 is a WebMCP surface for interrupted web workflows. When a server failure interrupts a user, the site preserves the *outcome* the user was after — not just the button they clicked — and exposes it to a browser agent that arrives cold. The set of tools the agent can see changes as server-authoritative state changes, so an agent is offered a capability exactly while the server would authorize it, and never otherwise.

## The thesis

A broken route is not a lost goal.

Most error handling conflates the two. "Send invoice" fails, so the workflow is dead until an engineer ships a fix. But the user's actual goal was *"Acme Corp can read invoice INV-2841"* — email was only the route. Heap 4 models that split explicitly, which lets a browser agent do something more useful than watch a status page.

```text
outcome:  Acme Corp can read invoice INV-2841
  ├─ route: email_delivery      ← broken at DeliveryService.ts:42
  └─ route: secure_share_link   ← allowlisted, available right now
```

## The dynamic tool surface

This is the part that is native to WebMCP and impossible in a static tool manifest. Heap 4's registered tools are a pure function of server state:

| Server state | `deliver_by_alternate_route` | `revoke_alternate_delivery` | `resume_intent` |
| --- | :---: | :---: | :---: |
| `active` — nothing wrong | absent | absent | absent |
| `blocked` — primary route broken | **registered** | absent | absent |
| `mitigated` — link live, defect open | absent | **registered** | absent |
| `resumable` — repair deployed | absent | **registered** | **registered** |
| `completed` — nothing outstanding | absent | absent | absent |

The agent normally cannot discover an action that is invalid for the current state. Stale tool handles and race conditions remain possible, so every mutation still needs server-side enforcement. `deliver_by_alternate_route` withdraws itself after a link exists, while the server also rejects duplicate issuance. `revoke_alternate_delivery` persists past completion, so a workaround is always retractable.

## The vertical slice

1. A user sends invoice `INV-2841` for $4,850.
2. The server persists exactly one invoice, then executes a reproducible delivery-provider defect and returns HTTP 500.
3. Heap 4 stores the outcome, the routes that could reach it, partial progress, request ID, build, stack, source location, and protected invariants.
4. A browser agent enters cold, discovers the interrupted workflow, and finds it can act — not just report.
5. **Route A (seconds, no engineer):** the agent calls `deliver_by_alternate_route`. The server mints a scoped, expiring, revocable share link. Acme can read the invoice now. The invoice is *not* marked sent, the amount is untouched, no second invoice exists, and the defect is still open. The intent becomes `mitigated`, not `completed`.
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

- `deliver_by_alternate_route` — reach the outcome another way while the primary route is broken.
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
