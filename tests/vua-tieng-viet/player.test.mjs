import { test } from "node:test";
import assert from "node:assert/strict";
import { commitInput, evaluateGuess, keyboardKnowledge, selectAnswer, startRound, submitGuess } from "../../lib/vua-tieng-viet/player-engine.ts";
import { fixtureId, playerPayload, playerReleaseRow } from "./player-fixture.ts";

test("feedback reserves exact letters first and does not overcount repeated letters", () => {
  assert.deepEqual(evaluateGuess("AAB", "ABA"), ["correct", "present", "present"]);
  assert.deepEqual(evaluateGuess("MÈO", "MMM"), ["correct", "absent", "absent"]);
  assert.deepEqual(evaluateGuess("ẾĐÊ", "EDẾ"), ["absent", "absent", "present"]);
});

const metadata = () => ({ id: crypto.randomUUID(), timestamp: "2026-11-14T01:00:00Z" });
test("keyboard evidence keeps the strongest fact per exact accented letter across guesses", () => {
  const guesses = [
    { id: fixtureId(1), input: "EÊĐ", normalized: "EÊĐ", feedback: ["present","absent","absent"], submittedAt: "2026-11-14T01:00:00Z" },
    { id: fixtureId(2), input: "EÊD", normalized: "EÊD", feedback: ["absent","correct","present"], submittedAt: "2026-11-14T01:00:01Z" },
    { id: fixtureId(3), input: "EÊD", normalized: "EÊD", feedback: ["correct","absent","absent"], submittedAt: "2026-11-14T01:00:02Z" },
  ];
  const evidence = keyboardKnowledge(guesses);
  assert.equal(evidence.get("E"),"correct"); assert.equal(evidence.get("Ê"),"correct");
  assert.equal(evidence.get("Đ"),"absent"); assert.equal(evidence.get("D"),"present");
  assert.equal(evidence.get("Ế"),undefined);
});
const release = payload => ({ payload, payloadHash: "a".repeat(64), publishedAt: "2026-11-14T00:00:00Z" });
test("all levels pin configuration and bounds 1/6/12; rejected guesses consume nothing", () => {
  for (const limit of [1,6,12]) for (const level of [3,5,7,9]) {
    let state = startRound(release(playerPayload(limit)),level,undefined,() => 0,metadata);
    assert.equal(state.round.attemptLimit,limit);
    const incomplete = submitGuess(state,state.round.revision,metadata);
    assert.equal(incomplete.error,"INCOMPLETE"); assert.equal(incomplete.state,state);
    state = commitInput(state,"X".repeat(level)).state;
    const rejected = submitGuess(state,state.round.revision,metadata);
    assert.equal(rejected.error,"NOT_IN_DICTIONARY"); assert.equal(rejected.state,state);
    assert.equal(state.round.input,"X".repeat(level)); assert.deepEqual(state.round.guesses,[]);
    state = commitInput(state,state.answer.original).state;
    const won = submitGuess(state,state.round.revision,metadata).state;
    assert.equal(won.round.status,"won"); assert.equal(won.round.guesses.length,1);
    assert.equal(submitGuess(won,won.round.revision,metadata).state,won);
    assert.equal(commitInput(won,"A").state,won);
  }
  for (const limit of [0,13,1.5]) assert.throws(() => startRound(release(playerPayload(limit)),3,undefined,() => 0,metadata));
});

test("accent-specific rejection, canonical equality, strongest keyboard evidence and immutable rows", () => {
  const payload = playerPayload(); payload.levels[3].guesses.push("MMM"); payload.levels[3].guesses.sort();
  let state = startRound(release(payload),3,undefined,() => 0,metadata);
  state = commitInput(state,"MMM").state;
  state = submitGuess(state,state.round.revision,metadata).state;
  assert.deepEqual(state.round.guesses[0].feedback,["correct","absent","absent"]);
  assert.equal(keyboardKnowledge(state.round.guesses).get("M"),"correct");
  assert.equal(commitInput(state,"M").error,null);
  state = commitInput(state,"meo").state;
  const prior = state.round.guesses[0];
  state = submitGuess(state,state.round.revision,metadata).state;
  assert.equal(state.round.status,"playing");
  assert.equal(keyboardKnowledge(state.round.guesses).get("E"),"absent");
  assert.equal(commitInput(state,"meo").error,"ABSENT_LETTER");
  assert.equal(commitInput(state,"mèo!").state,state);
  state = commitInput(state,"me\u0300o").state;
  state = submitGuess(state,state.round.revision,metadata).state;
  assert.equal(state.round.status,"won");
  assert.deepEqual(state.round.guesses[0],prior);
  assert.equal(state.round.guesses[2].input,"me\u0300o");
});

test("loss uses exactly the configured accepted attempts and stale/terminal transitions do nothing", () => {
  for (const limit of [1,6,12]) {
    const payload = playerPayload(limit); payload.levels[3].guesses.push("ÈOM"); payload.levels[3].guesses.sort();
    let state = startRound(release(payload),3,undefined,() => 0,metadata);
    for (let i=0;i<limit;i++) {
      state = commitInput(state,"ÈOM").state;
      assert.equal(submitGuess(state,state.round.revision - 1,metadata).state,state);
      state = submitGuess(state,state.round.revision,metadata).state;
    }
    assert.equal(state.round.status,"lost"); assert.equal(state.round.guesses.length,limit);
    assert.equal(submitGuess(state,state.round.revision,metadata).state,state);
  }
});

test("cryptographic bounded selection rejects bias and replay excludes the previous answer", () => {
  const one = playerPayload().levels[3].answers[0];
  const answers = [one,{ ...one, id: fixtureId(4) },{ ...one, id: fixtureId(5) }];
  const values = [0xffffffff,2];
  assert.equal(selectAnswer(answers,undefined,() => values.shift()).id,fixtureId(5));
  assert.equal(selectAnswer(answers,one.id,() => 0).id,fixtureId(4));
  assert.equal(selectAnswer([one],one.id,() => 0),one);
  assert.throws(() => selectAnswer([],undefined,() => 0),/EMPTY_LEVEL/);
  assert.throws(() => selectAnswer(answers,undefined,() => { throw new Error("unavailable"); }),/RANDOM_FAILED/);
  assert.throws(() => selectAnswer(answers,undefined,() => -1),/RANDOM_FAILED/);
  assert.throws(() => selectAnswer(answers,undefined,() => 0xffffffff),/RANDOM_FAILED/);
  const state = startRound(release(playerPayload()),3,undefined,() => 0,metadata);
  const ready = commitInput(state,"mèo").state;
  const failed = submitGuess(ready,ready.round.revision,() => { throw new Error("UUID failed"); });
  assert.equal(failed.state,ready); assert.equal(failed.error,"RANDOM_FAILED");
});

test("pointer changes retry a complete release and malformed/oversized input cannot be cached", async () => {
  const { loadCurrentRelease, parseCurrentRelease, readPublicJson, validateReleaseRow } = await import("../../lib/vua-tieng-viet/public-release.ts");
  const old = await validateReleaseRow([playerReleaseRow()],fixtureId(90));
  const nextPayload = playerPayload(); nextPayload.releaseId = fixtureId(99);
  const next = await validateReleaseRow([playerReleaseRow(nextPayload)],fixtureId(99));
  let pointers = 0;
  const result = await loadCurrentRelease({ pointer: async () => ({ releaseId: ++pointers === 1 ? fixtureId(90) : fixtureId(99), pointerRevision: pointers === 1 ? "1" : "2" }), release: async id => id === fixtureId(90) ? old : next });
  assert.equal(result.payload.releaseId,fixtureId(99)); assert.equal(pointers,4);
  await assert.rejects(() => loadCurrentRelease({ pointer: async () => ({ releaseId: fixtureId(90), pointerRevision: String(++pointers) }), release: async () => old }),/RELEASE_CHANGED/);
  assert.throws(() => parseCurrentRelease([]),/NO_RELEASE/);
  assert.throws(() => parseCurrentRelease([{ release_id: fixtureId(90), pointer_revision: 9007199254740992 }]),/INVALID_RELEASE/);
  await assert.rejects(() => readPublicJson(new Response('{"a":1,"a":2}'),100),/INVALID_RELEASE/);
  await assert.rejects(() => readPublicJson(new Response("x".repeat(101)),100),/INVALID_RELEASE/);
  const empty = playerPayload(); empty.levels[9].answers = [];
  await assert.rejects(() => validateReleaseRow([playerReleaseRow(empty)],empty.releaseId),/EMPTY_LEVEL/);
});

test("public release validates exact schema, accent membership, four levels and canonical hash", async () => {
  const { validateReleaseRow } = await import("../../lib/vua-tieng-viet/public-release.ts");
  const row = playerReleaseRow();
  const valid = await validateReleaseRow([row], row.id);
  assert.equal(valid.payload.levels[9].answers[0].normalized, "TIẾNGVIỆT");
  await assert.rejects(() => validateReleaseRow([{ ...row, payload_sha256: "0".repeat(64) }], row.id));
  for (const attemptLimit of [0,13,1.5]) await assert.rejects(() => validateReleaseRow([playerReleaseRow(playerPayload(attemptLimit))], row.id));
  for (const mutate of [payload => { payload.privateNotes = "secret"; }, payload => { payload.levels[3].guesses = ["MEO"]; }, payload => { payload.levels[3].answers[0].definitionVi = " "; }, payload => { payload.levels[3].guesses.reverse(); }, payload => { payload.attributions[0].licenseUrl = "javascript:alert(1)"; }]) {
    const payload = playerPayload(); mutate(payload);
    await assert.rejects(() => validateReleaseRow([playerReleaseRow(payload)], row.id));
  }
});
