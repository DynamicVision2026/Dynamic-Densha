import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCheckoutUrl, shopifyStoreDomain } from "../src/lib/shopify-checkout.ts";

function withShopifyEnv<T>(fn: () => T): T {
  const prior = {
    domain: process.env.SHOPIFY_STORE_DOMAIN,
    buyout: process.env.SHOPIFY_VARIANT_BUYOUT,
    annual: process.env.SHOPIFY_VARIANT_ANNUAL,
  };
  process.env.SHOPIFY_STORE_DOMAIN = "kanji-densha.myshopify.com";
  process.env.SHOPIFY_VARIANT_BUYOUT = "9001";
  process.env.SHOPIFY_VARIANT_ANNUAL = "9002";
  try {
    return fn();
  } finally {
    process.env.SHOPIFY_STORE_DOMAIN = prior.domain;
    process.env.SHOPIFY_VARIANT_BUYOUT = prior.buyout;
    process.env.SHOPIFY_VARIANT_ANNUAL = prior.annual;
  }
}

test("no accountEmail -> no checkout[email] param, same URL shape as before", () => {
  withShopifyEnv(() => {
    const url = new URL(buildCheckoutUrl("annual", "tok-1"));
    assert.equal(url.pathname, "/cart/9002:1");
    assert.equal(url.searchParams.get("checkout[email]"), null);
    assert.equal(url.searchParams.get("attributes[kd_token]"), "tok-1");
    assert.equal(url.searchParams.get("attributes[kd_plan]"), "annual");
  });
});

test("accountEmail present -> checkout[email] carries it, URL-encoded by URLSearchParams", () => {
  withShopifyEnv(() => {
    const url = new URL(buildCheckoutUrl("buyout", "tok-2", "mom+family@example.com"));
    assert.equal(url.searchParams.get("checkout[email]"), "mom+family@example.com");
    // every other param is still present and correct -- the prefill is additive
    assert.equal(url.searchParams.get("attributes[kd_token]"), "tok-2");
    assert.equal(url.searchParams.get("attributes[kd_plan]"), "buyout");
  });
});

test("null/empty accountEmail is treated the same as omitted -- no empty checkout[email] param", () => {
  withShopifyEnv(() => {
    const url = new URL(buildCheckoutUrl("annual", "tok-3", null));
    assert.equal(url.searchParams.get("checkout[email]"), null);
  });
});

test("shopifyStoreDomain reflects SHOPIFY_STORE_DOMAIN, empty string when unset", () => {
  withShopifyEnv(() => {
    assert.equal(shopifyStoreDomain(), "kanji-densha.myshopify.com");
  });
});

test("still throws when the store domain isn't configured", () => {
  const prior = process.env.SHOPIFY_STORE_DOMAIN;
  delete process.env.SHOPIFY_STORE_DOMAIN;
  try {
    assert.throws(() => buildCheckoutUrl("annual", "tok-4"), /SHOPIFY_STORE_DOMAIN/);
  } finally {
    if (prior !== undefined) process.env.SHOPIFY_STORE_DOMAIN = prior;
  }
});
