import type { StepContext } from '@scriptpipe/core';

/** A document as it appears in the source list. */
export interface Document {
  id: string;
  title: string;
  text: string;
}

/**
 * source -> bronze: read the raw document list and capture it, trimming whitespace. Missing
 * fields throw rather than being papered over — bronze should still be trustworthy.
 */
export async function ingest(ctx: StepContext): Promise<void> {
  const docs = await ctx.read<Document[]>('source');

  const captured: Document[] = docs.map((doc) => {
    if (!doc.id || !doc.text) {
      throw new Error(`Document is missing an id or text: ${JSON.stringify(doc)}`);
    }
    return { id: doc.id, title: doc.title, text: doc.text.trim() };
  });

  await ctx.write('documents', captured);
  ctx.logger.info(`  ingested ${captured.length} document(s)`);
}
