import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
const database = `vtv_collision_${randomUUID().replaceAll("-", "")}`;
const container = "supabase_db_4snow";
const run = (args, input) => execFileSync("docker", args, { input, encoding: "utf8" });
const sql = (input) => run(["exec", "-i", container, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"], input);
run(["exec", container, "createdb", "-U", "postgres", database]);
try {
  for (const migration of readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort()) {
    sql(readFileSync(`supabase/migrations/${migration}`, "utf8"));
  }
  sql(readFileSync("tests/supabase/collisions.sql", "utf8"));
  console.log("Collision SQL passed");
} finally {
  run(["exec", container, "dropdb", "-U", "postgres", database]);
}
