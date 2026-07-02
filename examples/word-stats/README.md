# Example: word-stats (partitioned fan-out)

A small document set flows through every layer, **fanning out** in the middle to analyze each
document independently:

```
source  documents.json
   -> bronze  captured documents (one file)
   -> silver  word-counts collection   ← one {id}.json per document
   -> gold    summary roll-up (one file)
```

This example exists to show the 0.2.0 features:

- **Partitioned step** — `analyze` declares `partition` (the documents), `key` (the document id),
  and `concurrency: 4`. The engine drives the per-item loop; the step body just takes one
  document and returns its stats. No hand-rolled loop, no counters, no `Promise.all`.
- **Collection asset** — `wordCounts` is declared `entries: true`, so it's a directory of
  `word-counts/{id}.json` files. The engine writes each item's return value there by key.
- **Scoped `ctx` IO** — steps call `ctx.read` / `ctx.readAll` / `ctx.write` instead of importing
  `fs` or reaching for raw paths. `summarize` reads the whole collection back with
  `ctx.readAll('wordCounts')`.

## Run it

```bash
npm install
npm start -w @scriptpipe/example-word-stats
```

Then inspect the generated layers:

- `data/bronze/documents.json` — the captured list
- `data/silver/word-counts/` — one file per document (`doc-1.json`, `doc-2.json`, …)
- `data/gold/summary.json` — the roll-up

Run `npm run clean -w @scriptpipe/example-word-stats` to reset the generated layers.

## Try changing the concurrency

Set `concurrency: 1` on the `analyze` step in `word-stats.pipeline.ts` and the fan-out becomes
strictly sequential — the same result, produced one document at a time. The knob is the only
difference; the step body never changes.
