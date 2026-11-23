import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const validator = fileURLToPath(new URL("../../scripts/ci/check-pull-request.mjs", import.meta.url));

function createRepository(t) {
  const cwd = mkdtempSync(join(tmpdir(), "pr-check-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--initial-branch=master");
  git("config", "user.name", "Test Author");
  git("config", "user.email", "test@example.invalid");
  const commit = (subject) => {
    git("commit", "--allow-empty", "-m", subject);
    return git("rev-parse", "HEAD");
  };
  const base = commit("Legacy history predating the PR checks");

  return {
    cwd, git, commit,
    check(pr) {
      const event = join(cwd, "event.json");
      const output = join(cwd, "outputs");
      writeFileSync(output, "");
      writeFileSync(event, JSON.stringify({
        pull_request: {
          base: { ref: "master", sha: base },
          head: { ref: "codex/issue-123-update-v2.1", sha: git("rev-parse", "HEAD") },
          title: "ci(github)!: add required checks",
          ...pr,
        },
      }));
      const result = spawnSync(process.execPath, [validator], {
        cwd, encoding: "utf8", env: { ...process.env, GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output },
      });
      return { ...result, output: readFileSync(output, "utf8") };
    },
  };
}

test("a valid PR accepts scoped commits and ignores target history", (t) => {
  const { check, commit, git } = createRepository(t);
  git("switch", "-c", "work");
  commit("feat(quiz): require a receipt");
  const result = check();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, "backend=false\n");
});

test("a backend file removed by the PR still requires backend checks", (t) => {
  const { check, commit, cwd, git } = createRepository(t);
  mkdirSync(join(cwd, "supabase", "migrations"), { recursive: true });
  writeFileSync(join(cwd, "supabase", "migrations", "migration.sql"), "select 1;\n");
  git("add", "supabase");
  const withMigration = commit("Legacy migration from target history");
  git("switch", "-c", "work");
  git("mv", "supabase/migrations/migration.sql", "migration.txt");
  commit("chore(quiz): archive a migration");
  const result = check({ base: { ref: "master", sha: withMigration } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, "backend=true\n");
});

test("metadata diagnostics identify the wrong source branch, title and new commit", (t) => {
  const { check, commit, git } = createRepository(t);
  const sha = commit("Rework the gate");
  const result = check({ head: { ref: "fix/bad-.separator", sha }, title: "fix: add required checks" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Source branch "fix\/bad-\.separator"/);
  assert.match(result.stderr, /PR title "fix: add required checks"/);
  assert.ok(result.stderr.includes(`Commit ${git("rev-parse", "--short", sha)} subject "Rework the gate"`));
});

test("a technical merge of the advanced target does not add target commits or changes to the PR", (t) => {
  const { check, commit, cwd, git } = createRepository(t);
  git("switch", "-c", "work");
  commit("ci(github): set up CI");
  git("switch", "master");
  mkdirSync(join(cwd, "supabase"));
  writeFileSync(join(cwd, "supabase", "config.toml"), "# upstream change\n");
  git("add", "supabase");
  const newBase = commit("Legacy target-only change");
  git("switch", "work");
  git("merge", "--no-ff", "-m", "Merge target into work", "master");
  const result = check({ base: { ref: "master", sha: newBase } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, "backend=false\n");
});

test("the repository's master branch can sync staging, while fork branches use conventional names", (t) => {
  const { check, commit, git } = createRepository(t);
  const base = { ref: "release/staging", sha: git("rev-parse", "HEAD"), repo: { id: 1 } };
  const sha = commit("fix(quiz): correct scoring");
  const ownMaster = check({ base, head: { ref: "master", sha, repo: { id: 1 } } });
  assert.equal(ownMaster.status, 0, ownMaster.stderr);
  const forkMaster = check({ base, head: { ref: "master", sha, repo: { id: 2 } } });
  assert.equal(forkMaster.status, 1);
  assert.match(forkMaster.stderr, /Source branch "master"/);
});
