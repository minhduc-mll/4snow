import test from "node:test";
import assert from "node:assert/strict";
import { startRound, commitInput, submitGuess } from "../../lib/vua-tieng-viet/player-engine.ts";
import { applyRoundHint, guessCells, nextRoundHint } from "../../lib/vua-tieng-viet/round-hints.ts";
import { decodeRoundSave, encodeRoundSave } from "../../lib/vua-tieng-viet/round-save.ts";
import { fixtureId, playerPayload } from "./player-fixture.ts";

const time = "2026-11-14T01:00:00.000Z";
function playing(answer, accuracy = "strict") {
  const payload = playerPayload();
  if (answer) {
    payload.levels[3].answers[0].original = answer;
    payload.levels[3].answers[0].normalized = answer;
    payload.levels[3].guesses = [answer];
  }
  return startRound({ payload, payloadHash: "", publishedAt: time }, 3, undefined, () => 0,
    () => ({ id: fixtureId(100), timestamp: time }), "free", accuracy);
}
function guess(state, input) {
  const edited = commitInput(state, input).state;
  return submitGuess(edited, edited.round.revision, () => ({ id: fixtureId(200 + state.round.guesses.length), timestamp: time })).state;
}

test("same-base feedback does not count as revealing the exact accent; locked cells only affect their current row", () => {
  const initial = guess(playing(), "MEO");
  const reveal = nextRoundHint(initial);
  assert.deepEqual(reveal, { kind: "reveal", row: 1, letter: "È" });
  const revealed = applyRoundHint(initial, reveal, time);
  const draft = commitInput(revealed, "mxa").state;
  const lock = nextRoundHint(draft);
  assert.deepEqual(lock, { kind: "lock", row: 1, position: 1 });
  const locked = applyRoundHint(draft, lock, time);
  assert.equal(locked.round.input, "ma");
  assert.deepEqual(guessCells(locked), ["M", "È", "A"]);
  assert.equal(commitInput(locked, "xyz").error, "INVALID_INPUT");
  const restored = decodeRoundSave(encodeRoundSave(locked, time));
  assert.deepEqual(restored, locked);
  const next = guess(restored, "ma");
  assert.equal(next.round.guesses.at(-1).normalized, "MÈA");
  assert.deepEqual(guessCells(next), []);
  assert.deepEqual(decodeRoundSave(encodeRoundSave(next, time)), next);
});

test("revealing a repeated answer letter only costs one credit and all-locked input remains submittable", () => {
  let state = playing("MAM");
  for (const letter of ["M", "A"]) {
    const hint = nextRoundHint(state);
    assert.equal(hint.letter, letter);
    state = applyRoundHint(state, hint, time);
  }
  assert.deepEqual(nextRoundHint(state), { kind: "lock", row: 0, position: 0 });
  const rotated = guess(playing(), "ÈOM");
  assert.equal(nextRoundHint(rotated).letter, "È");
  state = guess(guess(playing(), "MÈA"), "AAO");
  for (let position = 0; position < 3; position++) {
    state = applyRoundHint(state, nextRoundHint(state), time);
  }
  assert.deepEqual(guessCells(state), ["M", "È", "O"]);
  assert.equal(nextRoundHint(state), null);
  const won = guess(state, "");
  assert.equal(won.round.status, "won");
  assert.deepEqual(decodeRoundSave(encodeRoundSave(won, time)), won);
});

test("round save rejects malformed, duplicate or impossible hint outcomes", () => {
  const initial = playing();
  const revealed = applyRoundHint(initial, nextRoundHint(initial), time);
  const saved = encodeRoundSave(revealed, time);
  for (const corrupt of [
    value => { value.hintCredits = 4; },
    value => { value.round.hints[0].letter = "X"; },
    value => { value.round.hints[0].row = 1; },
    value => { value.round.hints.push(value.round.hints[0]); },
    value => { value.round.hints[0] = { row: 0, kind: "lock", position: 0 }; },
  ]) {
    const value = JSON.parse(saved);
    corrupt(value);
    assert.throws(() => decodeRoundSave(JSON.stringify(value)), { code: "invalid" });
  }
});
