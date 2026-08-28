import type { DemoSessionState } from '../src/shared/demoApiTypes';
import { createInitialDemoState } from '../src/shared/demoTransitions';

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

const CREATE_SESSION_TABLE = `
  CREATE TABLE IF NOT EXISTS demo_sessions (
    session_id TEXT PRIMARY KEY NOT NULL,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT
`;

interface DemoSessionRow {
  state_json: string;
}

export class DemoSessionRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async get(sessionId: string): Promise<DemoSessionState> {
    await this.ensureSchema();
    const row = await this.db
      .prepare('SELECT state_json FROM demo_sessions WHERE session_id = ?1')
      .bind(sessionId)
      .first<DemoSessionRow>();

    if (!row) {
      const initial = createInitialDemoState(sessionId);
      await this.save(initial);
      return initial;
    }

    const parsed = JSON.parse(row.state_json) as DemoSessionState;
    if (parsed.sessionId !== sessionId) {
      throw new Error('Stored demo session did not match the requested session.');
    }
    return parsed;
  }

  async reset(sessionId: string): Promise<DemoSessionState> {
    const state = createInitialDemoState(sessionId);
    await this.save(state);
    return state;
  }

  async save(state: DemoSessionState): Promise<void> {
    await this.ensureSchema();
    await this.db
      .prepare(
        `INSERT INTO demo_sessions (session_id, state_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(session_id) DO UPDATE SET
           state_json = excluded.state_json,
           updated_at = excluded.updated_at`,
      )
      .bind(state.sessionId, JSON.stringify(state), new Date().toISOString())
      .run();
  }

  private async ensureSchema(): Promise<void> {
    await this.db.prepare(CREATE_SESSION_TABLE).run();
  }
}
