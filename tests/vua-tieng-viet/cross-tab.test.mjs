import test from "node:test";
import assert from "node:assert/strict";
import { createRoundStorage, decodeRoundSave, encodeRoundSave, ROUND_SAVE_KEY } from "../../lib/vua-tieng-viet/round-save.ts";
import { startRound, commitInput, submitGuess } from "../../lib/vua-tieng-viet/player-engine.ts";
import { applyRoundHint, nextRoundHint } from "../../lib/vua-tieng-viet/round-hints.ts";
import { playerPayload, fixtureId } from "./player-fixture.ts";
const time = "2026-11-14T01:00:00.000Z";
function round(id = 100) { return startRound({ payload: playerPayload(), payloadHash: "a".repeat(64), publishedAt: time },3,undefined,() => 0,() => ({ id: fixtureId(id), timestamp: time })); }
function device() {
  const values = new Map(); let queue = Promise.resolve();
  const lock = operation => { const next = queue.then(operation); queue = next.catch(() => {}); return next; };
  const port = { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key) };
  return { values, port, lock, tab: (serialize = lock) => createRoundStorage(() => port,serialize) };
}
test("a stale tab cannot overwrite a changed save before its storage event arrives", async () => {
  const d = device(), a = d.tab(); a.read(); const original = round();
  assert.equal(await a.write(original),"saved");
  const b = d.tab(); b.read();
  assert.equal(await a.write(commitInput(original,"M").state),"saved");
  assert.equal(await b.write(commitInput(original,"S").state),"conflict");
  assert.equal(decodeRoundSave(d.values.get(ROUND_SAVE_KEY)).round.input,"M");
  assert.equal(b.observe(),"conflict");
});
test("explicit keep replaces a different round without merging; load revalidates the full save", async () => {
  const d = device(), a = d.tab(), b = d.tab(); a.read(); const original = round();
  await a.write(original); b.read();
  await a.write(commitInput(round(200),"S").state,true);
  assert.equal(b.observe(),"conflict");
  const kept = await b.keep(commitInput(original,"M").state);
  assert.equal(kept.kind,"restored");
  assert.equal(kept.state.round.id,fixtureId(100));
  assert.equal(kept.state.round.input,"M");
  const loaded = await a.loadSaved();
  assert.equal(loaded.kind,"restored");
  assert.deepEqual(loaded.state,kept.state);
  d.values.set(ROUND_SAVE_KEY,"broken");
  assert.equal(b.observe(),"conflict");
  assert.equal((await b.loadSaved()).kind,"invalid");
  assert.equal(d.values.get(ROUND_SAVE_KEY),"broken");
  assert.equal((await b.keep(kept.state)).kind,"restored");
});
test("resolution invalidates queued writes and revisions never go backwards", async () => {
  const d = device(), a = d.tab(); a.read(); const original = round(); await a.write(original);
  let release;
  const gate = new Promise(resolve => release = resolve);
  const b = d.tab(operation => gate.then(() => d.lock(operation))); b.read();
  const stale = b.write(commitInput(original,"S").state);
  const newer = commitInput(commitInput(original,"M").state,"MÈ").state;
  assert.equal(await a.write(newer),"saved");
  assert.equal(await a.write(commitInput(original,"M").state),"superseded");
  const load = b.loadSaved(); release();
  assert.equal(await stale,"superseded");
  assert.equal((await load).state.round.input,"MÈ");
  const kept = await b.keep(original);
  assert.ok(kept.state.round.revision > newer.round.revision);
  assert.equal(kept.state.round.input,"");
});
test("resolution access/quota failures and unavailable locks leave the selected round and save untouched", async () => {
  const d = device(), a = d.tab(); a.read(); const original = round(); await a.write(original);
  const before = d.values.get(ROUND_SAVE_KEY);
  const b = d.tab(); b.read();
  const set = d.port.setItem, get = d.port.getItem;
  d.port.setItem = () => { throw Error("quota"); };
  assert.equal((await b.keep(commitInput(original,"M").state)).kind,"unavailable");
  assert.equal(d.values.get(ROUND_SAVE_KEY),before);
  d.port.setItem = set; d.port.getItem = () => { throw Error("denied"); };
  assert.equal((await b.loadSaved()).kind,"unavailable");
  d.port.getItem = get;
  assert.equal((await b.loadSaved()).kind,"restored");
  const unavailable = d.tab(async () => { throw Error("no lock"); }); unavailable.read();
  assert.equal(await unavailable.write(commitInput(original,"M").state),"unavailable");
  assert.equal(d.values.get(ROUND_SAVE_KEY),before);
});
test("explicit reset invalidates pending writers and never clears a changed foreign save", async () => {
  const d = device(), a = d.tab(); a.read(); const original = round(); await a.write(original);
  let release; const gate = new Promise(resolve => release = resolve);
  const b = d.tab(operation => gate.then(() => d.lock(operation))); b.read();
  const stale = b.write(commitInput(original,"M").state), reset = b.reset(); release();
  assert.equal(await stale,"superseded"); assert.equal(await reset,"saved"); assert.equal(d.values.get(ROUND_SAVE_KEY),undefined);
  d.values.set(ROUND_SAVE_KEY,"broken"); b.read();
  await a.loadSaved(); const next = await a.keep(round(200)); assert.equal(next.kind,"restored");
  assert.equal(await b.reset(),"conflict"); assert.equal(decodeRoundSave(d.values.get(ROUND_SAVE_KEY)).round.id,fixtureId(200));
});

test("concurrent wins of the same round settle the streak only once", async () => {
  const d = device(), a = d.tab(), b = d.tab();
  a.read();
  const draft = commitInput(round(), "mèo").state;
  await a.write(draft);
  b.read();
  const won = id => submitGuess(draft, draft.round.revision, () => ({ id: fixtureId(id), timestamp: time })).state;
  assert.equal(await a.write(won(101)), "saved");
  assert.equal(await b.write(won(102)), "conflict");
  assert.equal((await b.keep(won(102))).state.round.guesses[0].id, fixtureId(101));
  assert.deepEqual(b.streak(), { current: 1, longest: 1 });
  const restored = d.tab();
  assert.equal(restored.read().state.round.status, "won");
  assert.deepEqual(restored.streak(), { current: 1, longest: 1 });
  assert.equal(JSON.parse(d.values.get(ROUND_SAVE_KEY)).schemaVersion, 5);
  assert.equal(restored.hintCredits(), 1);
});

test("corrupt round metadata and legacy saves recover independently of streak counters", async () => {
  const d = device(), a = d.tab(), active = round();
  const key = ROUND_SAVE_KEY;
  d.values.set(key, encodeRoundSave(active, time));
  assert.deepEqual(a.read().state.round.rules, active.round.rules);
  assert.deepEqual(a.streak(), { current: 0, longest: 0 });
  d.values.set(key, JSON.stringify({ schemaVersion: 4, normalizerVersion: "vi-nfc-v2", streak: { current: 11, longest: 21, countable: true } }));
  assert.equal(a.read().kind, "invalid");
  assert.deepEqual(a.streak(), { current: 11, longest: 21 });
  assert.equal(await a.write(round(200), true), "saved");
  assert.deepEqual(a.streak(), { current: 0, longest: 21 });
});

test("replay settles a pending win atomically after a temporary storage failure", async () => {
  const d = device(), a = d.tab();
  a.read();
  const draft = commitInput(round(), "mèo").state;
  await a.write(draft);
  const won = submitGuess(draft, draft.round.revision, () => ({ id: fixtureId(101), timestamp: time })).state;
  const set = d.port.setItem;
  d.port.setItem = () => { throw Error("quota"); };
  assert.equal(await a.write(won), "unavailable");
  assert.deepEqual(a.streak(), { current: 0, longest: 0 });
  d.port.setItem = set;
  assert.equal(await a.write(round(200), true, won), "saved");
  const restored = d.tab();
  assert.equal(restored.read().state.round.id, fixtureId(200));
  assert.deepEqual(restored.streak(), { current: 1, longest: 1 });
  assert.equal(restored.hintCredits(), 1);
});

test("two tabs cannot spend the same hint credit twice, including explicit keep", async () => {
  const d = device(), a = d.tab(), b = d.tab();
  a.read();
  const draft = commitInput(round(), "mèo").state;
  await a.write(draft);
  const won = submitGuess(draft, draft.round.revision, () => ({ id: fixtureId(101), timestamp: time })).state;
  await a.write(won);
  const next = round(200);
  await a.write(next, true, won);
  b.read();
  assert.equal(b.hintCredits(), 1);
  const revealed = applyRoundHint(next, nextRoundHint(next), time);
  assert.deepEqual(await Promise.all([a.write(revealed), b.write(revealed)]), ["saved", "conflict"]);
  assert.equal(a.hintCredits(), 0);
  assert.equal((await b.keep(revealed)).kind, "restored");
  assert.equal(b.hintCredits(), 0);
  assert.equal((await b.write(applyRoundHint(revealed, nextRoundHint(revealed), time))), "superseded");
  const stored = b.read().state;
  assert.equal(await b.write(applyRoundHint(stored, nextRoundHint(stored), time)), "unavailable");
  assert.deepEqual(b.read().state.round.hints, revealed.round.hints);
});
