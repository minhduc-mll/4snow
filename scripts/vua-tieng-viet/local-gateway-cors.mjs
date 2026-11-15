// CLI-generated Kong config is recreated on stack startup. Reapply after restart.
import { execFileSync } from "node:child_process";

const container = "supabase_kong_4snow";
const docker = (args, input) => execFileSync("docker", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
try {
  const config = docker(["exec", container, "cat", "/home/kong/kong.yml"]);
  const start = config.indexOf("  - name: functions-v1\n");
  if (start < 0) throw new Error("Unsupported local Kong config: functions service missing");
  const next = config.indexOf("\n  - name:", start + 1);
  const end = next < 0 ? config.length : next;
  const service = config.slice(start, end);
  const marker = "    plugins:\n      - name: cors\n";
  if (!service.includes(marker)) throw new Error("Unsupported local Kong config: expected default function CORS plugin");
  const updated = config.slice(0, start) + service.replace(marker, "    plugins:\n") + config.slice(end);
  // The declarative config includes keys. Keep it in memory/in-container only.
  const path = "/tmp/4snow-vtv-gateway-config.json";
  try {
    docker(["exec", "-i", container, "sh", "-c", `umask 077; cat > ${path}`], JSON.stringify({ config: updated }));
    docker(["exec", container, "wget", "-q", "-O", "/dev/null", "--header=Content-Type: application/json", `--post-file=${path}`, "http://127.0.0.1:8001/config"]);
  } finally {
    docker(["exec", container, "rm", "-f", path]);
  }
  console.log("Local function gateway now delegates CORS to each Edge Function. Reapply after Supabase restart.");
} catch {
  // Docker errors can contain config credentials: never forward raw output.
  console.error("Local gateway update failed. Verify the 4snow Kong container and its default config layout; no credentials were printed.");
  process.exitCode = 1;
}
