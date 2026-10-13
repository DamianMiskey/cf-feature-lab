import { applyD1Migrations, env } from "cloudflare:test";

// Runs before each test file: create the D1 tables from ./migrations.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
