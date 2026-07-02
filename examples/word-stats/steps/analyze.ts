import type { Document } from './ingest';

/** Per-document word statistics — one of these is written per item into the silver collection. */
export interface DocStats {
  id: string;
  title: string;
  wordCount: number;
  uniqueWords: number;
  topWord: string;
}

/**
 * bronze -> silver (one item): compute word stats for a single document. This is the fan-out
 * body — the engine calls it once per document and writes the return value to `wordCounts/{id}`.
 */
export function analyze(doc: Document): DocStats {
  const words = doc.text.toLowerCase().split(/\s+/).filter(Boolean);

  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  let topWord = '';
  let topCount = 0;
  for (const [word, count] of counts) {
    if (count > topCount) {
      topWord = word;
      topCount = count;
    }
  }

  return {
    id: doc.id,
    title: doc.title,
    wordCount: words.length,
    uniqueWords: counts.size,
    topWord,
  };
}
