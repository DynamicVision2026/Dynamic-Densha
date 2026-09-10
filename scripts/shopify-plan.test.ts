import assert from "node:assert/strict";
import { test } from "node:test";
import { variantIdToPlan } from "../src/lib/shopify-plan.ts";

const ENV = { buyoutVariantId: "50476993282296", annualVariantId: "50477040238840" };

test("the configured buyout variant id resolves to buyout", () => {
  assert.equal(variantIdToPlan("50476993282296", ENV), "buyout");
});

test("the configured annual variant id resolves to annual", () => {
  assert.equal(variantIdToPlan("50477040238840", ENV), "annual");
});

test("a numeric variant id (as Shopify's JSON payload sends it) resolves the same as its string form", () => {
  assert.equal(variantIdToPlan(50476993282296, ENV), "buyout");
  assert.equal(variantIdToPlan(50477040238840, ENV), "annual");
});

test("an unrecognized variant id resolves to undefined -- never falls back to a guess", () => {
  assert.equal(variantIdToPlan("99999999999999", ENV), undefined);
});

test("a null/undefined/empty variant id resolves to undefined", () => {
  assert.equal(variantIdToPlan(null, ENV), undefined);
  assert.equal(variantIdToPlan(undefined, ENV), undefined);
  assert.equal(variantIdToPlan("", ENV), undefined);
});

test("with no env configured at all, nothing ever resolves -- there is no hardcoded fallback table", () => {
  assert.equal(variantIdToPlan("50476993282296", {}), undefined);
  assert.equal(variantIdToPlan("50477040238840", {}), undefined);
});

test("only buyout configured: the annual id (now unconfigured) no longer resolves", () => {
  const partial = { buyoutVariantId: "50476993282296" };
  assert.equal(variantIdToPlan("50476993282296", partial), "buyout");
  assert.equal(variantIdToPlan("50477040238840", partial), undefined);
});

test(
  "resolution is driven entirely by the configured ids, not a hardcoded table: " +
    "swapping which env var holds which id swaps the resolved plan for the same variant id",
  () => {
    const swapped = { buyoutVariantId: "50477040238840", annualVariantId: "50476993282296" };
    assert.equal(variantIdToPlan("50477040238840", swapped), "buyout");
    assert.equal(variantIdToPlan("50476993282296", swapped), "annual");
  },
);

test("the two configured ids being identical (a misconfiguration) never causes a silent wrong answer for the other", () => {
  const misconfigured = { buyoutVariantId: "50476993282296", annualVariantId: "50476993282296" };
  assert.equal(variantIdToPlan("50476993282296", misconfigured), "buyout");
  assert.equal(variantIdToPlan("11111111111111", misconfigured), undefined);
});
