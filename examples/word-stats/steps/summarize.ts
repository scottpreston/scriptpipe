import type { StepContext } from '@scriptpipe/core';
import type { DocStats } from './analyze';

/** The published roll-up over every analyzed document. */
export interface Summary {
  documents: number;
  totalWords: number;
  byDocument: DocStats[];
}

/**
 * silver -> gold: read the whole word-counts collection back and roll it up into one summary.
 * `readAll` returns items in no guaranteed order, so we sort by id for a stable output.
 */
export async function summarize(ctx: StepContext): Promise<void> {
  const stats = await ctx.readAll<DocStats>('wordCounts');
  const byDocument = [...stats].sort((a, b) => a.id.localeCompare(b.id));

  const summary: Summary = {
    documents: byDocument.length,
    totalWords: byDocument.reduce((total, doc) => total + doc.wordCount, 0),
    byDocument,
  };

  await ctx.write('summary', summary);
  ctx.logger.info(
    `  summarized ${summary.documents} document(s), ${summary.totalWords} total words`,
  );
}
