import { readJson, writeJson } from '@scriptpipe/core';
import type { StepContext } from '@scriptpipe/core';
import type { RawContact } from './ingest-contacts';

/** A normalized, validated contact ready to be merged into a template. */
export interface CleanContact {
  firstName: string;
  fullName: string;
  email: string;
  company: string;
  plan: string;
}

const VALID_PLANS = new Set(['free', 'pro', 'enterprise']);

/**
 * bronze -> silver: trim whitespace, lowercase emails, derive a first name, and validate.
 * Bad records throw rather than being silently dropped.
 */
export async function cleanContacts(ctx: StepContext): Promise<void> {
  const raw = readJson<RawContact[]>(ctx.reads.rawContacts!);

  const clean: CleanContact[] = raw.map((contact, index) => {
    const fullName = contact.name.trim();
    const email = contact.email.trim().toLowerCase();
    const plan = contact.plan.trim().toLowerCase();

    if (fullName === '') {
      throw new Error(`Contact ${index + 1} has an empty name.`);
    }
    if (!email.includes('@')) {
      throw new Error(`Contact "${fullName}" has an invalid email: "${contact.email}".`);
    }
    if (!VALID_PLANS.has(plan)) {
      throw new Error(`Contact "${fullName}" has an unknown plan: "${contact.plan}".`);
    }

    const firstName = fullName.split(/\s+/)[0]!;
    return { firstName, fullName, email, company: contact.company.trim(), plan };
  });

  writeJson(ctx.writes.cleanedContacts!, clean);
  ctx.logger.info(`  normalized and validated ${clean.length} contact(s)`);
}
