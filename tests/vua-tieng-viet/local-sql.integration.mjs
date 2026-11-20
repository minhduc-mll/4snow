// Fresh database inside the LOCAL PostgreSQL container; never resets app data.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

const container = "supabase_db_4snow";
const suite = process.argv[2] ?? "import";
if (!["import", "editorial", "bulk", "management"].includes(suite)) throw new Error("Expected import, editorial, bulk, or management SQL suite");
const database = `vtv_verify_${randomUUID().replaceAll("-", "")}`;
let created = false;
const docker = (args, input) => execFileSync("docker", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
try {
  docker(["exec", container, "createdb", "-U", "postgres", database]);
  created = true;
  const migrations = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort();
  for (const name of migrations) {
    docker(["exec", "-i", container, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"], readFileSync(`supabase/migrations/${name}`, "utf8"));
  }
  docker(["exec", "-i", container, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"], readFileSync(`tests/supabase/${suite}.sql`, "utf8"));
  console.log(`PASS ${suite} SQL suite in fresh local database with ${migrations.length} migrations (database removed afterward)`);
} catch {
  console.error("Disposable local SQL verification failed; inspect migrations/test assertions without sharing credentials.");
  process.exitCode = 1;
} finally {
  if (created) {
    try { docker(["exec", container, "dropdb", "-U", "postgres", database]); }
    catch { console.error(`Could not remove disposable database ${database}`); process.exitCode = 1; }
  }
}
