import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const demoSessions = sqliteTable('demo_sessions', {
  sessionId: text('session_id').primaryKey(),
  stateJson: text('state_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});
