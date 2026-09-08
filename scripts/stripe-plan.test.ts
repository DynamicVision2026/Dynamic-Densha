import assert from "node:assert/strict";
import { test } from "node:test";
import { priceIdToPlan } from "../src/lib/stripe-plan.ts";

const ENV = { monthlyPriceId: "price_monthly_abc", annualPriceId: "price_annual_xyz" };

test("the configured monthly price id resolves to monthly", () => {
  assert.equal(priceIdToPlan("price_monthly_abc", ENV), "monthly");
});

test("the configured annual price id resolves to yearly", () => {
  assert.equal(priceIdToPlan("price_annual_xyz", ENV), "yearly");
});

test("an unrecognized price id resolves to undefined -- never falls back to a guess", () => {
  assert.equal(priceIdToPlan("price_some_other_thing", ENV), undefined);
});

test("a null/undefined/empty price id resolves to undefined", () => {
  assert.equal(priceIdToPlan(null, ENV), undefined);
  assert.equal(priceIdToPlan(undefined, ENV), undefined);
  assert.equal(priceIdToPlan("", ENV), undefined);
});

test("with no env configured at all, nothing ever resolves -- there is no hardcoded fallback table", () => {
  assert.equal(priceIdToPlan("price_monthly_abc", {}), undefined);
  assert.equal(priceIdToPlan("price_annual_xyz", {}), undefined);
});

test("only monthly configured: the annual id (now unconfigured) no longer resolves", () => {
  const partial = { monthlyPriceId: "price_monthly_abc" };
  assert.equal(priceIdToPlan("price_monthly_abc", partial), "monthly");
  assert.equal(priceIdToPlan("price_annual_xyz", partial), undefined);
});

test(
  "resolution is driven entirely by the configured ids, not a hardcoded table: " +
    "swapping which id is 'monthly' vs 'annual' swaps the answer for the same price id",
  () => {
    const swapped = { monthlyPriceId: "price_annual_xyz", annualPriceId: "price_monthly_abc" };
    // Same literal price id string as the first test above, opposite answer --
    // this is the property that would fail if plan resolution were secretly
    // still consulting a hardcoded map instead of these two env values.
    assert.equal(priceIdToPlan("price_annual_xyz", swapped), "monthly");
    assert.equal(priceIdToPlan("price_monthly_abc", swapped), "yearly");
  },
);

test("the two configured ids being identical (a misconfiguration) never causes a silent wrong answer for the other", () => {
  // If someone pastes the same price id into both env vars, that id still
  // resolves (to whichever plan the code checks first -- monthly, by
  // convention), and everything else still correctly resolves to undefined
  // rather than treating the collision as "match anything close enough."
  const misconfigured = { monthlyPriceId: "price_same", annualPriceId: "price_same" };
  assert.equal(priceIdToPlan("price_same", misconfigured), "monthly");
  assert.equal(priceIdToPlan("price_totally_different", misconfigured), undefined);
});
