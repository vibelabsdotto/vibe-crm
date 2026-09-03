import { eq } from 'drizzle-orm';
import { DatabaseService } from '../src/database/database.service';
import { apiTokens, plans, user } from '../src/database/schema';

/**
 * One-shot legacy migration (contract §2a): rewrites Clerk user IDs in
 * `plans.owner_id` / `api_tokens.owner_id` to Better Auth user IDs.
 *
 * Matching is case-insensitive via `owner_email` → `user.email`. Rows whose
 * `owner_id` already is a known Better-Auth user id are left untouched, so
 * the script is idempotent and safe to re-run. Owner emails without a
 * matching Better-Auth user are reported on stderr — run this AFTER the
 * first Better-Auth login with the usual email address:
 *
 *   npx tsx apps/api/scripts/remap-owners.ts
 */
function main(): void {
  const database = new DatabaseService();
  database.onModuleInit();
  try {
    const users = database.db
      .select({ id: user.id, email: user.email })
      .from(user)
      .all();
    const idByEmail = new Map(
      users.map((u) => [u.email.toLowerCase(), u.id] as const),
    );
    const knownUserIds = new Set(users.map((u) => u.id));

    let remappedPlans = 0;
    let alreadyOkPlans = 0;
    const unmatched: string[] = [];

    for (const row of database.db.select().from(plans).all()) {
      if (knownUserIds.has(row.ownerId)) {
        alreadyOkPlans++;
        continue;
      }
      const target = idByEmail.get(row.ownerEmail.toLowerCase());
      if (!target) {
        unmatched.push(`plans/${row.slug} owner_email=${row.ownerEmail}`);
        continue;
      }
      database.db
        .update(plans)
        .set({ ownerId: target })
        .where(eq(plans.slug, row.slug))
        .run();
      remappedPlans++;
    }

    let remappedTokens = 0;
    let alreadyOkTokens = 0;
    for (const row of database.db.select().from(apiTokens).all()) {
      if (knownUserIds.has(row.ownerId)) {
        alreadyOkTokens++;
        continue;
      }
      const target = idByEmail.get(row.ownerEmail.toLowerCase());
      if (!target) {
        unmatched.push(`api_tokens/${row.id} owner_email=${row.ownerEmail}`);
        continue;
      }
      database.db
        .update(apiTokens)
        .set({ ownerId: target })
        .where(eq(apiTokens.id, row.id))
        .run();
      remappedTokens++;
    }

    for (const entry of unmatched) {
      console.error(`no Better-Auth user matched: ${entry}`);
    }
    console.log(
      JSON.stringify({
        event: 'owners_remapped',
        plans: { remapped: remappedPlans, alreadyBetterAuth: alreadyOkPlans },
        apiTokens: {
          remapped: remappedTokens,
          alreadyBetterAuth: alreadyOkTokens,
        },
        unmatched: unmatched.length,
      }),
    );
  } finally {
    database.close();
  }
}

main();
