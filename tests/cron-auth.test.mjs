import { test } from "node:test";
import assert from "node:assert/strict";
import { isCronRequestAuthorized } from "../lib/cron-auth.mjs";

test("le bon secret est accepté", () => {
  assert.equal(isCronRequestAuthorized("Bearer s3cret-valeur", "s3cret-valeur"), true);
});

test("un mauvais secret est refusé", () => {
  assert.equal(isCronRequestAuthorized("Bearer autre-valeur", "s3cret-valeur"), false);
  assert.equal(isCronRequestAuthorized("Bearer s3cret-valeu", "s3cret-valeur"), false);
});

test("sans CRON_SECRET, tout est refusé, y compris « Bearer undefined »", () => {
  assert.equal(isCronRequestAuthorized("Bearer undefined", undefined), false);
  assert.equal(isCronRequestAuthorized("Bearer ", ""), false);
  assert.equal(isCronRequestAuthorized("Bearer    ", "   "), false);
  assert.equal(isCronRequestAuthorized("Bearer null", null), false);
});

test("sans en-tête, tout est refusé", () => {
  assert.equal(isCronRequestAuthorized(null, "s3cret-valeur"), false);
  assert.equal(isCronRequestAuthorized("", "s3cret-valeur"), false);
});
