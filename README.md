# Heap 4

**From runtime failure to verified recovery.**

Heap 4 is a lightweight runtime-to-repository bridge for interrupted web workflows. It preserves what a user was trying to accomplish, correlates that intent with a real server failure and relevant source context, automatically starts a bounded repair pipeline, validates the candidate in an explicitly scoped sandbox, and exposes the repaired workflow through native WebMCP so a browser agent can finish and verify the original task.

## The one vertical slice

1. A user sends invoice `INV-2841` for $4,850.
2. The server persists exactly one invoice, then executes a reproducible delivery-provider bug and returns HTTP 500.
3. Heap 4 stores the goal, partial progress, request ID, build, stack, source location, and protected invariants.
4. A repair worker automatically creates a job-scoped sandbox plan from the failure capsule.
5. The pipeline reproduces the failure, produces a bounded patch, runs the affected checks and full build, and waits at `ready_for_review`.
6. A browser agent enters cold and discovers the interrupted workflow through WebMCP; it can inspect status or attach context while engineering proceeds.
7. A human reviews the validated artifact and promotes the candidate release.
8. The native WebMCP surface dynamically gains `resume_intent`.
9. The browser agent runs only the missing delivery step and verifies that the original invoice was sent without duplication.

The website never edits its own source and the browser agent never receives repository or deployment authority.

See [WEBMCP_PIPELINE.md](WEBMCP_PIPELINE.md) for the exact browser-agent contract, authority boundaries, and acceptance checklist.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. For native WebMCP testing, use ChatGPT's in-app browser or enable `chrome://flags/#enable-webmcp-testing` in a supported Chrome build.

The URL receives a `session` query parameter. Keep that parameter when moving the demo between browser surfaces; it identifies the same server-side interrupted workflow without exposing user data.

## Native WebMCP acceptance flow

1. Click **Reset Demo Baseline**.
2. Click **Send invoice** and confirm the HTTP 500 state.
3. Close the recovery drawer and navigate to another area.
4. Ask the browser agent: **“What happened to what I was doing?”**
5. Confirm fresh `list_active_intents` and `inspect_intent` entries appear in the WebMCP inspector.
6. Ask it to explain the interruption or attach context while the repair worker runs.
7. Open **Engineering Review**, watch the sandbox and validation envelope reach `ready_for_review`, then approve promotion.
8. Ask: **“Can you finish it now?”**
9. Confirm `resume_intent` and `verify_intent` execute, the invoice becomes sent, and the dynamic resume tool is removed after completion.

If the page reports that native WebMCP is unavailable, the normal application still works, but that browser is not a valid acceptance environment. Heap 4 intentionally does not install a JavaScript `modelContext` polyfill.

## WebMCP tools

- `list_active_intents` — discover unfinished human workflows.
- `inspect_intent` — inspect goal, partial state, invariants, failure, source, and repair context.
- `add_user_context` — attach a concise clarification to the interruption capsule.
- `request_repair` — refresh or explicitly request the bounded repair job; failures normally start it automatically.
- `get_repair_status` — observe repair, deployment, and resumability state.
- `verify_intent` — verify the original outcome and no-duplicate invariant from server state.
- `resume_intent` — dynamically available only while an approved repair makes the intent resumable.

Production registration is forwarded to the browser's real `document.modelContext.registerTool(...)` implementation. The in-memory implementation in `src/webmcp/modelContext.ts` is installed explicitly by tests only and never attached to `document`, `window`, or `navigator`.

## Authority boundaries

```text
Browser agent              Engineering worker
user/application scope     repository scope
        │                         │
        └────── Heap intent ──────┘
                    │
           explicit approval
                    │
                deployment
                    │
           WebMCP safe resume
```

The browser agent can inspect, request, resume, and verify. The engineering boundary can propose a patch. Only explicit approval changes the deployed build.

## Verification

```bash
npm test
npm run build
```

The suite proves the real delivery-service failure, HTTP 500 capsule, server persistence, blocked-state guard, review requirement, dynamic tool lifecycle, invariant-safe resume, and server-authoritative goal verification.

## License

Apache-2.0. See [LICENSE](LICENSE).
