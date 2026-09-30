/**
 * Apply db/sql/*.sql to the database in DATABASE_URL (idempotent, ordered, recorded in
 * agni.schema_migrations). Usage: npm run db:setup
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (put it in .env).");
  const db = new PrismaClient();
  try {
    const ext = await db.$queryRawUnsafe<Array<{ extversion: string }>>("select extversion from pg_extension where extname = 'postgis'");
    if (!ext.length) throw new Error("PostGIS is not enabled. Run `CREATE EXTENSION postgis;` in the database first.");
    await db.$executeRawUnsafe("CREATE SCHEMA IF NOT EXISTS agni");
    await db.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS agni.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const done = new Set((await db.$queryRawUnsafe<Array<{ name: string }>>("select name from agni.schema_migrations")).map((r) => r.name));
    const dir = path.join(process.cwd(), "db", "sql");
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      if (done.has(f)) {
        console.log(`skip ${f} (already applied)`);
        continue;
      }
      // one statement per call: the pooled connection does not accept multi-statement prepared queries
      const statements = fs.readFileSync(path.join(dir, f), "utf8").split(/;\s*(?:\r?\n|$)/).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
      for (const st of statements) await db.$executeRawUnsafe(st);
      await db.$executeRawUnsafe("INSERT INTO agni.schema_migrations (name) VALUES ($1)", f);
      console.log(`applied ${f} (${statements.length} statements)`);
    }
    const t = await db.$queryRawUnsafe<Array<{ tablename: string }>>("select tablename from pg_tables where schemaname = 'agni' order by 1");
    console.log("agni tables:", t.map((x) => x.tablename).join(", "));
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e).replace(/postgres(ql)?:\/\/\S+/g, "<url>"));
  process.exit(1);
});
