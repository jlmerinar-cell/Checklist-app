/**
 * Free-tier caps for shared lists.
 * Keep the numbers in supabase/schema.sql (v_list_cap, v_member_cap) in sync.
 */

/** Shared lists on the free tier. Local-only lists are unlimited. */
export const FREE_SHARED_LIST_CAP = 25;

/** Members per shared list on the free tier. */
export const FREE_MEMBER_CAP = 10;

/**
 * UPGRADE PATH — shared-list limits.
 * Wire this to billing once a paid Supabase plan (or your own) is active,
 * then raise FREE_SHARED_LIST_CAP and FREE_MEMBER_CAP here and in
 * supabase/schema.sql. Nothing charges the user today.
 */
export function upgradeLimits(): { ok: false; message: string } {
  return {
    ok: false,
    message:
      "Free tier still caps shared lists at " +
      FREE_SHARED_LIST_CAP +
      " and members at " +
      FREE_MEMBER_CAP +
      ". Raise those caps after upgrading Supabase, then connect this function to your plan check.",
  };
}
