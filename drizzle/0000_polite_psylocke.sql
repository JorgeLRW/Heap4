CREATE TABLE `demo_sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`state_json` text NOT NULL,
	`updated_at` text NOT NULL
) STRICT;
