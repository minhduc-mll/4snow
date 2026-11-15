import test from "node:test";
import assert from "node:assert/strict";
import { playerPayload, fixtureId } from "./player-fixture.ts";
import { startRound, commitInput, submitGuess } from "../../lib/vua-tieng-viet/player-engine.ts";
import { encodeRoundSave, decodeRoundSave, createRoundStorage, ROUND_SAVE_KEY } from "../../lib/vua-tieng-viet/round-save.ts";
const time = "2026-11-14T01:00:00.000Z";
function fixture() {
  const payload = playerPayload();
  return startRound({ payload, payloadHash: "a".repeat(64), publishedAt: time },3,undefined,() => 0,() => ({ id: fixtureId(100), timestamp: time }));
}
test("a historical round survives an atomic save with raw input and full public snapshot", () => {
  const state = commitInput(fixture(),"me\u0300").state;
  const restored = decodeRoundSave(encodeRoundSave(state,time));
  assert.deepEqual(restored,state);
});
test("storage failures preserve in-memory play and unreadable bytes until explicit reset", async () => {
  const values = new Map([[ROUND_SAVE_KEY,"broken"],["other","keep"]]);
  let denied = false;
  const storage = createRoundStorage(() => ({
    getItem: key => { if (denied) throw Error("access"); return values.get(key) ?? null; },
    setItem: (key,value) => { if (denied) throw Error("quota"); values.set(key,value); },
    removeItem: key => { if (denied) throw Error("access"); values.delete(key); },
  }),operation => Promise.resolve().then(operation));
  assert.equal(storage.read().kind,"invalid");
  assert.equal(await storage.write(fixture()),"unavailable");
  assert.equal(values.get(ROUND_SAVE_KEY),"broken");
  assert.equal(await storage.reset(),"saved");
  assert.equal(values.get("other"),"keep");
  assert.equal(await storage.write(fixture()),"saved");
  assert.equal(storage.read().kind,"restored");
  denied = true;
  assert.equal(await storage.write(fixture()),"unavailable");
  assert.equal(storage.read().kind,"unavailable");
  assert.equal(await storage.reset(),"unavailable");
});
function submitted(raw = "MEO", state = fixture(), n = 101) {
  const edited = commitInput(state,raw).state;
  return submitGuess(edited,edited.round.revision,() => ({ id: fixtureId(n), timestamp: time })).state;
}
function saved(state = submitted()) { return JSON.parse(encodeRoundSave(state,time)); }
test("feedback and status hints cannot change the recovered result or keyboard evidence", () => {
  const value = saved(submitted("mèo"));
  value.round.status = "lost";
  value.round.guesses[0].feedback = ["absent","absent","absent"];
  const state = decodeRoundSave(JSON.stringify(value));
  assert.equal(state.round.status,"won");
  assert.deepEqual(state.round.guesses[0].feedback,["correct","correct","correct"]);
});
test("reject structural history, incomplete provenance, and incompatible versions without repair", () => {
  const mutations = [
    v => v.schemaVersion = 2,
    v => v.normalizerVersion = "future",
    v => v.normalizerVersion = "vi-latin-v1",
    v => delete v.snapshot,
    v => delete v.snapshot.answer.definitionVi,
    v => v.snapshot.attributions = [],
    v => v.snapshot.membership.push(v.snapshot.membership[0]),
    v => v.snapshot.membership[0] = "aaa",
    v => v.snapshot.answer.attributionIds = [fixtureId(55)],
    v => v.round.configVersion = fixtureId(55),
    v => v.round.level = 5,
    v => v.snapshot.attemptLimit = 13,
    v => v.round.revision = -1,
    v => v.extra = true,
    v => v.round.guesses[0].normalized = "MÈO",
    v => v.round.guesses[0].submittedAt = "2026-11-13T00:00:00.000Z",
    v => v.savedAt = "2026-11-13T00:00:00.000Z",
    v => v.round.endedAt = time,
    v => v.round.guesses.push(v.round.guesses[0]),
    v => { v.round.guesses.push({ ...v.round.guesses[0], id: fixtureId(102) }); v.round.revision = v.revision = 4; }, // E was ruled out
    v => { v.round.input = "E"; },
  ];
  for (const mutate of mutations) {
    const value = saved(); mutate(value);
    assert.throws(() => decodeRoundSave(JSON.stringify(value)),undefined,mutate.toString());
  }
  const terminal = saved(submitted("mèo"));
  terminal.round.guesses.push({ ...terminal.round.guesses[0], id: fixtureId(102) });
  assert.throws(() => decodeRoundSave(JSON.stringify(terminal)));
  for (const text of ["broken", " ".repeat(3*1024*1024+1), '{"schemaVersion":1,"schemaVersion":1}',JSON.stringify({})]) assert.throws(() => decodeRoundSave(text));
  assert.throws(() => decodeRoundSave('"'+"Ế".repeat(1024*1024)+'"'));
});
test("reject uncommitted editable input revisions and serialization failures", () => {
  const value = saved(fixture()); value.round.input = "M";
  assert.throws(() => decodeRoundSave(JSON.stringify(value)));
  const state = fixture(); state.answer.circular = state;
  assert.throws(() => encodeRoundSave(state,time));
});
