import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

const branchPattern = /^(?:feature|feat|bugfix|fix|hotfix|release|chore|ai|claude|codex|copilot|cursor)\/[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const subjectPattern = /^[a-z][a-z0-9-]*\([^\s()]+\)!?: \S(?:[^\r\n]*\S)?$/i;
const backendPaths = [
  "supabase/",
  "app/api/admin/",
  "lib/admin-auth.ts",
  "lib/quiz/",
  "lib/vua-tieng-viet/",
  "scripts/vua-tieng-viet/",
  "tests/supabase/",
  "tests/quiz/local-integrity.integration.mjs",
  ":(glob)tests/vua-tieng-viet/*.integration.mjs",
  ":(glob)tests/vua-tieng-viet/*.deno.mts",
  "package.json",
  "package-lock.json",
  ".github/workflows/pull-request.yml",
  "scripts/ci/check-pull-request.mjs",
];

try {
  const { pull_request: pr } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const base = pr?.base?.sha;
  const head = pr?.head?.sha;
  const source = pr?.head?.ref;
  const title = pr?.title;
  if (typeof base !== "string" || !/^[0-9a-f]{40}$/.test(base) ||
      typeof head !== "string" || !/^[0-9a-f]{40}$/.test(head) ||
      typeof source !== "string" || typeof title !== "string") {
    throw new Error("Missing or invalid pull request metadata");
  }

  const backendChanges = execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", `${base}...${head}`, "--", ...backendPaths], { encoding: "utf8" });
  appendFileSync(process.env.GITHUB_OUTPUT, `backend=${backendChanges.length > 0}\n`);

  const issues = [];
  const stagingSync = source === "master" && pr.base.ref === "release/staging" &&
    typeof pr.base.repo?.id === "number" && pr.base.repo.id === pr.head.repo?.id;
  if (!branchPattern.test(source) && !stagingSync) {
    issues.push(`Source branch ${JSON.stringify(source)} must follow Conventional Branch 1.1.0.`);
  }
  const subjectHint = "must use type(scope): description, with an optional ! before the colon.";
  if (!subjectPattern.test(title)) {
    issues.push(`PR title ${JSON.stringify(title)} ${subjectHint}`);
  }

  const commits = execFileSync("git", ["log", "--no-merges", "--format=%h%x09%s", `${base}..${head}`, "--"], { encoding: "utf8" });
  for (const commit of commits.split(/\r?\n/).filter(Boolean)) {
    const separator = commit.indexOf("\t");
    const hash = commit.slice(0, separator);
    const subject = commit.slice(separator + 1);
    if (!subjectPattern.test(subject)) {
      issues.push(`Commit ${hash} subject ${JSON.stringify(subject)} ${subjectHint}`);
    }
  }

  if (issues.length > 0) {
    console.error(issues.join("\n"));
    process.exitCode = 1;
  }
} catch (error) {
  console.error("Could not validate the pull request.", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
