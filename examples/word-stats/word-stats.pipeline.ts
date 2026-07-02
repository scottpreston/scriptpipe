import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { definePipeline, partitioned } from '@scriptpipe/core';
import { ingest, type Document } from './steps/ingest';
import { analyze } from './steps/analyze';
import { summarize } from './steps/summarize';

// Assets are located relative to this file so the pipeline runs from any working directory.
const here = dirname(fileURLToPath(import.meta.url));
const at = (relativePath: string): string => join(here, relativePath);

/**
 * A document set flows through every layer, fanning out in the middle:
 *
 *   source  documents.json
 *      -> bronze  captured documents (one file)
 *      -> silver  word-counts collection  ← one {id}.json per document, written by a fan-out step
 *      -> gold    summary roll-up (one file)
 *
 * `analyze` is a partitioned step: the engine drives the per-document loop (up to 4 at a time),
 * names each output by the document id, and writes whatever `analyze` returns. `summarize` reads
 * the whole collection back with `ctx.readAll`.
 */
export default definePipeline('word-stats', {
  assets: {
    source: { layer: 'source', uri: at('data/source/documents.json') },
    documents: { layer: 'bronze', uri: at('data/bronze/documents.json') },
    wordCounts: { layer: 'silver', uri: at('data/silver/word-counts'), entries: true },
    summary: { layer: 'gold', uri: at('data/gold/summary.json') },
  },
  steps: {
    ingest: {
      kind: 'deterministic',
      reads: ['source'],
      writes: ['documents'],
      run: ingest,
    },
    analyze: partitioned<Document>({
      kind: 'deterministic',
      reads: ['documents'],
      writes: ['wordCounts'],
      concurrency: 4,
      partition: (ctx) => ctx.read<Document[]>('documents'),
      key: (doc) => doc.id,
      run: (doc) => analyze(doc),
    }),
    summarize: {
      kind: 'deterministic',
      reads: ['wordCounts'],
      writes: ['summary'],
      run: summarize,
    },
  },
});
