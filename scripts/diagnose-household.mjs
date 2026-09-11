#!/usr/bin/env node
/**
 * Read-only household diagnostic for one parent account.
 *
 * Answers, for a single email or user id:
 *   1. how many `user` rows and linked auth providers that person has
 *      (a second user row is the usual cause of "my children vanished on my
 *      other device" -- it is a different identity, not a lost household)
 *   2. how many households they belong to (structurally capped at one by
 *      household_member_user_idx, but verified rather than assumed)
 *   3. where the subscription, children and progress actually live
 *   4. whether any ORPHANED households exist -- a `household` row with no
 *      member at all, which is what src/lib/server/household.ts's
 *      resolveHouseholdId leaves behind if two concurrent calls race
 *   5. the billing events behind the current entitlement, including the
 *      Shopify order name the refund flow needs
 *
 * SELECT only. It writes nothing, creates nothing, and deletes nothing, so
 * it is safe to point at production.
 *
 *   DATABASE_URL='postgres://...' node scripts/diagnose-household.mjs you@example.com
 *   DATABASE_URL='postgres://...' node scripts/diagnose-household.mjs --user-id abc123
 *   DATABASE_URL='postgres://...' node scripts/diagnose-household.mjs --orphans-only
 */
import pg from "pg";

const args = process.argv.slice(2);
const orphansOnly = args.includes("--orphans-only");
const userIdFlag = args.indexOf("--user-id");
const byUserId = userIdFlag !== -1 ? args[userIdFlag + 1] : null;
const email = args.find((a) => a.includes("@")) ?? null;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Point it at the Neon database and re-run.");
  process.exit(1);
}
if (!email && !byUserId && !orphansOnly) {
  console.error("usage: node scripts/diagnose-household.mjs <email> | --user-id <id> | --orphans-only");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const q = async (text, params = []) => (await pool.query(text, params)).rows;
const show = (label, rows) => {
  console.log(`\n--- ${label} (${rows.length}) ---`);
  if (rows.length === 0) console.log("  (none)");
  else console.table(rows);
};

try {
  // ---------- 1. identity ----------
  let users = [];
  if (!orphansOnly) {
    users = byUserId
      ? await q(`select "id", "name", "email", "emailVerified", "createdAt" from "user" where "id" = $1`, [byUserId])
      : await q(
          `select "id", "name", "email", "emailVerified", "createdAt" from "user"
           where lower("email") = lower($1)
              or lower("email") like lower($2)
           order by "createdAt"`,
          [email, `${(email ?? "").split("@")[0]}%@%`],
        );
    show("user rows matching that person (a near-match on the local part is included on purpose)", users);

    if (users.length > 0) {
      const ids = users.map((u) => u.id);
      show(
        "linked auth providers",
        await q(
          `select "userId", "providerId", "accountId", "createdAt" from "account"
           where "userId" = any($1) order by "createdAt"`,
          [ids],
        ),
      );

      // ---------- 2. household membership ----------
      show(
        "household_member rows (one per user is the structural maximum)",
        await q(
          `select hm.user_id, hm.household_id, hm.role, hm.joined_at, h.created_at as household_created_at
           from household_member hm
           left join household h on h.id = hm.household_id
           where hm.user_id = any($1)
           order by hm.joined_at`,
          [ids],
        ),
      );

      // ---------- 3. where things actually live ----------
      show(
        "subscription for those households",
        await q(
          `select s.household_id, s.state, s.plan, s.trial_ends_at, s.paid_until,
                  s.shopify_order_id, s.updated_at
           from subscription s
           where s.household_id in (select household_id from household_member where user_id = any($1))`,
          [ids],
        ),
      );

      show(
        "children owned by those user rows, and the household they resolve to",
        await q(
          `select c.id, c.name, c.grade, c.created_at, c.archived_at,
                  c.user_id, hm.household_id as resolved_household,
                  c.household_id as legacy_household_column,
                  (select count(*) from kanji_progress kp where kp.child_id = c.id) as progress_rows,
                  (select count(*) from practice_events pe where pe.child_id = c.id) as practice_rows
           from children c
           left join household_member hm on hm.user_id = c.user_id
           where c.user_id = any($1)
           order by c.created_at`,
          [ids],
        ),
      );

      // ---------- 5. billing ----------
      show(
        "billing events (payload.raw.name is the Shopify order name)",
        await q(
          `select be.household_id, be.type, be.received_at,
                  be.payload->>'shopifyOrderId' as shopify_order_id,
                  be.payload->'raw'->>'name' as order_name,
                  be.payload->>'plan' as plan
           from billing_event be
           where be.household_id in (select household_id from household_member where user_id = any($1))
           order by be.received_at`,
          [ids],
        ),
      );
    }
  }

  // ---------- 4. orphans (global) ----------
  const orphans = await q(
    `select h.id, h.created_at,
            (select count(*) from subscription s where s.household_id = h.id) as has_subscription,
            (select count(*) from billing_event b where b.household_id = h.id) as billing_events
     from household h
     where not exists (select 1 from household_member hm where hm.household_id = h.id)
     order by h.created_at desc
     limit 50`,
  );
  show("ORPHANED households — a household row with no member at all (the resolveHouseholdId race leaves these)", orphans);

  const totals = (
    await q(
      `select (select count(*) from household) as households,
              (select count(*) from household_member) as memberships,
              (select count(*) from "user") as users`,
    )
  )[0];

  // ---------- verdict ----------
  console.log("\n================ verdict ================");
  console.log(`totals: ${totals.users} users, ${totals.households} households, ${totals.memberships} memberships`);
  if (!orphansOnly) {
    if (users.length === 0) console.log("• No user row matched. Check the exact address used at sign-in.");
    else if (users.length > 1)
      console.log(
        `• ${users.length} SEPARATE user rows matched — this is a split identity, not a lost household.\n` +
          "  Children follow user_id, so each identity has its own household and its own children.",
      );
    else console.log("• Exactly one user row: identity is not split.");
  }
  console.log(
    orphans.length === 0
      ? "• No orphaned households: the resolveHouseholdId race has not fired in production."
      : `• ${orphans.length} orphaned household row(s). Harmless to entitlement (no member, no children),\n` +
        "  but they are the race's fingerprint and they show up in /app/admin as owner-less rows.",
  );
  console.log("=========================================");
} finally {
  await pool.end();
}
