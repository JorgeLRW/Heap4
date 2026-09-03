import type { DemoSessionState } from '../src/shared/demoApiTypes';
import { createInitialDemoState, upgradeDemoState } from '../src/shared/demoTransitions';

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

const CREATE_GRANT_INDEX_TABLE = `
  CREATE TABLE IF NOT EXISTS invoice_access_grants (
    token_hash TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  ) STRICT
`;

interface DemoSessionRow {
  state_json: string;
}

interface GrantIndexRow {
  session_id: string;
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

    const parsed = upgradeDemoState(JSON.parse(row.state_json) as DemoSessionState);
    if (parsed.sessionId !== sessionId) {
      throw new Error('Stored demo session did not match the requested session.');
    }
    return parsed;
  }

  async reset(sessionId: string): Promise<DemoSessionState> {
    const previous = await this.get(sessionId);
    if (previous.accessGrant) await this.dropGrantIndex(previous.accessGrant.tokenHash);
    const state = createInitialDemoState(sessionId);
    await this.save(state);
    return state;
  }

  async indexGrant(tokenHash: string, sessionId: string): Promise<void> {
    await this.ensureSchema();
    await this.db
      .prepare(
        `INSERT INTO invoice_access_grants (token_hash, session_id, created_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(token_hash) DO UPDATE SET session_id = excluded.session_id`,
      )
      .bind(tokenHash, sessionId, new Date().toISOString())
      .run();
  }

  async dropGrantIndex(tokenHash: string): Promise<void> {
    await this.ensureSchema();
    await this.db.prepare('DELETE FROM invoice_access_grants WHERE token_hash = ?1').bind(tokenHash).run();
  }

  async findSessionIdByTokenHash(tokenHash: string): Promise<string | null> {
    await this.ensureSchema();
    const row = await this.db
      .prepare('SELECT session_id FROM invoice_access_grants WHERE token_hash = ?1')
      .bind(tokenHash)
      .first<GrantIndexRow>();
    return row?.session_id ?? null;
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
    await this.db.prepare(CREATE_GRANT_INDEX_TABLE).run();
  }
}
