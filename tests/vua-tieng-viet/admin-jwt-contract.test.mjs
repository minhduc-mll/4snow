import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createAdminJwt, verifyAdminJwt } from "../../lib/admin-auth.ts";
import { verifyCustomAdminJwt } from "../../lib/vua-tieng-viet/admin-jwt.ts";

test("issued Node JWT satisfies Node and Edge contracts; denials retain Edge time constraints", async () => {
  const secret = "contract-secret", now = Math.floor(Date.now() / 1000);
  const issued = createAdminJwt(secret, "1h");
  assert.equal(verifyAdminJwt(issued.token, secret).valid, true);
  assert.equal(await verifyCustomAdminJwt(issued.token, secret, now), true);
  const sign = (header, payload) => { const body = [header, payload].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join("."); return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`; };
  const header = { alg: "HS256", typ: "JWT" }, claims = { role: "admin", iat: now, exp: now + 60 };
  for (const token of ["bad", `${issued.token}x`, sign({ ...header, alg: "none" }, claims), sign(header, { ...claims, role: "user" }), sign(header, { ...claims, iat: "bad" }), sign(header, { ...claims, exp: now - 1 })]) {
    assert.equal(verifyAdminJwt(token, secret).valid, false);
    assert.equal(await verifyCustomAdminJwt(token, secret, now), false);
  }
  for (const token of [sign(header, { ...claims, iat: now + 100 }), sign(header, { ...claims, nbf: now + 1 }), sign(header, { ...claims, exp: now + 0.5 })]) assert.equal(await verifyCustomAdminJwt(token, secret, now), false);
});
