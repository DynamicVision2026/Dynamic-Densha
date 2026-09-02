/**
 * household is the unit of subscription, trial, and entitlement (commerce
 * spec §2). Created once, at first parent-account creation, never merged or
 * split by any automated process.
 *
 * Implementation choice, not in the spec: rather than hooking better-auth's
 * own signup callback (a deeper integration this pass didn't take on),
 * `resolveHouseholdId` lazily creates the household + a fresh 10-day trial
 * on first real access — the first `listChildren`/`getHomeState`/
 * `createChild` call after signup, in practice. It is idempotent and race-
 * safe (household_member_user_idx is a unique index on user_id), so calling
 * it repeatedly, or concurrently for the same brand-new user, never creates
 * two households for one user.
 */
import { randomUUID } from "node:crypto";
import { trialEndsAtFrom } from "@/lib/trial-clock";
import { hashEmail } from "@/lib/trial-spent";

type Sql = {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
};

const TRIAL_DAYS = 10;

/**
 * One trial per parent email, ever (spec §2.2) -- trial_spent survives
 * account/household deletion (it has no foreign key to either, by design,
 * so nothing can cascade-delete it) and is checked here, the only place a
 * fresh trial is granted. A repeat email gets its household (so the app
 * still functions and a child profile can still be created) but with
 * trial_ends_at backdated to `nowIso`: entitlement() sees an
 * already-expired trial on the very next read, so canRide is false from
 * the start instead of another free ten days.
 *
 * Looks up email straight from better-auth's own "user" table rather than
 * threading it through every resolveHouseholdId caller -- this is the one
 * place that needs it. A userId with no email on record (the
 * VITE_AUTH_ENABLED=false dev-fallback user, "dev-user") has nothing to key
 * trial_spent on and gets the full trial: that path never runs against a
 * real signup.
 */
async function trialEndsAtForNewHousehold(
  sql: Sql,
  userId: string,
  nowIso: string,
): Promise<string> {
  const userRows = await sql<{ email: string | null }>`
    select email from "user" where id = ${userId}
  `;
  const email = userRows[0]?.email;
  if (!email) return trialEndsAtFrom(nowIso, TRIAL_DAYS);

  const emailHash = hashEmail(email);
  const spent = await sql<{ email_hash: string }>`
    select email_hash from trial_spent where email_hash = ${emailHash}
  `;
  if (spent[0]) return nowIso;

  await sql`
    insert into trial_spent (email_hash) values (${emailHash})
    on conflict (email_hash) do nothing
  `;
  return trialEndsAtFrom(nowIso, TRIAL_DAYS);
}

export type HouseholdRole = "owner" | "member";

/**
 * Get this user's household id, creating a fresh household + 10-day trial if
 * none exists yet. `nowIso` defaults to the real clock; callers that need a
 * fixed instant (tests, or anywhere else `now` must not drift mid-request)
 * should pass it explicitly.
 */
export async function resolveHouseholdId(
  sql: Sql,
  userId: string,
  nowIso: string = new Date().toISOString(),
): Promise<string> {
  const existing = await sql<{ household_id: string }>`
    select household_id from household_member where user_id = ${userId}
  `;
  if (existing[0]) return existing[0].household_id;

  const householdId = `hh_${randomUUID()}`;
  await sql`insert into household (id) values (${householdId})`;
  // ON CONFLICT: a concurrent caller may have just won the race and inserted
  // this user's membership first. Re-select rather than assume we won.
  await sql`
    insert into household_member (household_id, user_id, role)
    values (${householdId}, ${userId}, 'owner')
    on conflict (user_id) do nothing
  `;
  const row = await sql<{ household_id: string }>`
    select household_id from household_member where user_id = ${userId}
  `;
  const winningId = row[0]?.household_id ?? householdId;

  // Computed in JS, not as a dynamic Postgres interval: a bind parameter
  // can't appear inside a quoted interval literal like interval '${n} days'
  // — that would send the literal text "$1 days" to Postgres, not a bound
  // value. trial_ends_at is written once here and never recomputed (spec
  // §4 / §7.1), so an absolute timestamp is exactly what's wanted anyway.
  const trialEndsAt = await trialEndsAtForNewHousehold(sql, userId, nowIso);
  await sql`
    insert into subscription (household_id, state, trial_ends_at)
    values (${winningId}, 'trial', ${trialEndsAt})
    on conflict (household_id) do nothing
  `;
  return winningId;
}

/** Every parent account (user_id) currently in this household. */
export async function householdMembers(
  sql: Sql,
  householdId: string,
): Promise<Array<{ userId: string; role: HouseholdRole; joinedAt: string }>> {
  const rows = await sql<{ user_id: string; role: string; joined_at: string }>`
    select user_id, role, joined_at from household_member
    where household_id = ${householdId}
    order by joined_at asc
  `;
  return rows.map((r) => ({
    userId: r.user_id,
    role: r.role === "owner" ? "owner" : "member",
    joinedAt: r.joined_at,
  }));
}

/**
 * Invitation acceptance (spec §2.1): the invited user joins the inviter's
 * existing household and inherits its state, including a spent trial. This
 * is the ONLY way a second parent attaches to an existing household — never
 * by independent signup, which creates its own new household via
 * resolveHouseholdId above (the accepted, bounded abuse edge in spec §2.1).
 *
 * Not wired to any invitation-send/accept UI in this pass — that flow (a
 * token, an email, an accept page) doesn't exist yet. This function is the
 * safe join primitive it would call once it does.
 */
export async function joinHousehold(sql: Sql, householdId: string, userId: string): Promise<void> {
  await sql`
    insert into household_member (household_id, user_id, role)
    values (${householdId}, ${userId}, 'member')
    on conflict (user_id) do nothing
  `;
}
