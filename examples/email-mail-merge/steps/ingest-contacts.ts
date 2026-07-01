import { readText, writeJson } from '@scriptpipe/core';
import type { StepContext } from '@scriptpipe/core';
import { parseCsv } from '../lib/io';

/** A contact exactly as it appears in the source CSV (raw, untrimmed). */
export interface RawContact {
  name: string;
  email: string;
  company: string;
  plan: string;
}

/**
 * source -> bronze: read the raw contact list and capture it verbatim as JSON.
 * No cleaning here — bronze is the raw landing zone.
 */
export async function ingestContacts(ctx: StepContext): Promise<void> {
  const csv = readText(ctx.reads.contactList!);
  const rows = parseCsv(csv);

  const raw: RawContact[] = rows.map((row) => ({
    name: row.name!,
    email: row.email!,
    company: row.company!,
    plan: row.plan!,
  }));

  writeJson(ctx.writes.rawContacts!, raw);
  ctx.logger.info(`  ingested ${raw.length} contact(s) from the source list`);
}
