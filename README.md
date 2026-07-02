# ScriptPipe

**TypeScript-native pipeline organization for Node.js.**

ScriptPipe turns a folder of loose scripts into a structured, layered pipeline. Each pipeline
declares its **assets** (named inputs/outputs), organizes them into **layers**
(`source → bronze → silver → gold`), and defines **steps** that read and write those assets.
Execution order is derived from the reads and writes — you don't maintain a dependency map.

It's code-first and stays out of your way: your business logic remains normal TypeScript or
JavaScript functions. Not a platform, not a notebook, not a visual builder.

## Install

```bash
npm install @scriptpipe/core
```

## Quick start

```ts
import { definePipeline, runPipeline, readJson, writeJson } from '@scriptpipe/core';

const orders = definePipeline('orders', {
  assets: {
    ordersApi:       { layer: 'source', uri: 'https://example.com/api/orders' },
    rawOrders:       { layer: 'bronze', uri: 'data/bronze/orders.json' },
    cleanOrders:     { layer: 'silver', uri: 'data/silver/orders.json' },
    publishedOrders: { layer: 'gold',   uri: 'data/gold/orders.json' },
  },
  steps: {
    fetchOrders: { reads: ['ordersApi'],   writes: ['rawOrders'],       run: fetchOrders },
    cleanOrders: { reads: ['rawOrders'],    writes: ['cleanOrders'],     run: cleanOrders },
    publish:     { reads: ['cleanOrders'],  writes: ['publishedOrders'], run: publish },
  },
});

await runPipeline(orders);              // runs fetchOrders → cleanOrders → publish
await runPipeline(orders, { only: ['cleanOrders'] });
```

ScriptPipe derives the order from the graph: `publish` runs after `cleanOrders` because it
reads what `cleanOrders` writes. If a step throws, the error propagates — failures are never
silently skipped.

## Concepts

**Assets** have a `name`, a `layer`, and a `uri` (a location — file path, URL, S3 key). The
storage backend isn't ScriptPipe's concern.

**Layers** describe where an asset sits in the flow:

| Layer    | Purpose                                                     |
| -------- | ---------------------------------------------------------- |
| `source` | External inputs — APIs, inbound files, object storage       |
| `bronze` | Raw captured data                                          |
| `silver` | Cleaned, normalized, or intermediate data                 |
| `gold`   | Published, curated outputs — the terminal layer            |

ScriptPipe stops at `gold`. Delivering a gold output to its destination (an email API, a
bucket, a queue) is the consuming app's job.

**Steps** are self-contained scripts that `run` over their inputs. A step receives only the
assets it declared, resolved to `{ name, layer, uri }`:

```ts
import { readJson, writeJson } from '@scriptpipe/core';

export async function cleanOrders(ctx) {
  const raw = readJson(ctx.reads.rawOrders);      // pass the asset directly
  const clean = raw.map(normalizeOrder);
  writeJson(ctx.writes.cleanOrders, clean);
}
```

`readText` / `writeText` / `readJson` / `writeJson` also accept a plain path string, and you
can ignore them entirely and do your own IO. An optional `kind` field on a step is a label
for your own docs — every step runs the same way.

**Scoped IO.** A step's `ctx` also carries IO methods that route through the run's storage, so you
name an asset instead of a path — `ctx.read('rawOrders')` parses the declared asset,
`ctx.write('cleanOrders', value)` writes it. Reaching for an undeclared asset throws. Because
these go through storage, `runPipeline(pipeline, { storage })` can redirect every step's IO to a
different backend without touching step code.

## Fan-out (partitioned) steps

A **partitioned** step processes many items independently — the engine drives the loop, names each
output, and runs items concurrently. Declare `partition` (the items), `key` (each item's output
name), and an optional `concurrency` (default 1):

```ts
import { definePipeline, partitioned } from '@scriptpipe/core';

definePipeline('reports', {
  assets: {
    accounts: { layer: 'bronze', uri: 'data/bronze/accounts.json' },
    reports:  { layer: 'silver', uri: 'data/silver/reports', entries: true }, // a collection
    rollup:   { layer: 'gold',   uri: 'data/gold/rollup.json' },
  },
  steps: {
    buildReports: partitioned({
      reads: ['accounts'],
      writes: ['reports'],                        // exactly one `entries` asset
      concurrency: 4,                             // up to 4 items in flight
      partition: (ctx) => ctx.read('accounts'),   // → the items
      key: (account) => account.id,               // → reports/{id}.json
      run: (account) => buildReport(account),     // ONE item; its return is written for you
    }),
    rollup: {
      reads: ['reports'],
      writes: ['rollup'],
      run: async (ctx) => ctx.write('rollup', await ctx.readAll('reports')),
    },
  },
});
```

A **collection asset** (`entries: true`) is a directory of `{key}.json` files. The engine writes
whatever `run(item, ctx)` returns to `<uri>/<key>.json`; downstream steps read the whole set back
with `ctx.readAll` / `ctx.list`. Concurrency is scoped to a single step — steps never touch
`Promise.all` themselves.

## Try the examples

[`examples/email-mail-merge`](./examples/email-mail-merge) — a 5-record email list that flows
`source → bronze → silver → gold` to produce mail-merged emails.

[`examples/word-stats`](./examples/word-stats) — a **partitioned** pipeline: fan out per-document
word analysis into a silver collection (one file per document, `concurrency: 4`), then aggregate to
a gold summary.

```bash
npm install
npm start -w @scriptpipe/example-email-mail-merge
npm start -w @scriptpipe/example-word-stats
```

Inspect `data/bronze/…` through `data/gold/…` to watch the records get captured, transformed, and
published one layer at a time.

## JavaScript

ScriptPipe is written in TypeScript but works from CommonJS too:

```js
const { definePipeline } = require('@scriptpipe/core');
module.exports = definePipeline('orders', { assets: { /* … */ }, steps: { /* … */ } });
```

## Packages

npm-workspaces monorepo under `packages/*`.

- **`@scriptpipe/core`** — define, validate, order, run, and read/write filesystem assets. _(available on npm)_
- **`@scriptpipe/cli`** — command-line runner. _(planned)_

The filesystem helpers live in `@scriptpipe/core` for now and may move to a dedicated
`@scriptpipe/fs` later; other backends (S3, Postgres) would arrive as their own adapters
implementing the `Storage` interface so core stays backend-light.

## Release notes

### 0.2.0

- **Partitioned (fan-out) steps** — `partitioned({ partition, key, run, concurrency })`. The engine
  drives the per-item loop, names each output, and runs items with bounded concurrency.
- **Collection assets** — `entries: true` marks an asset as a directory of `{key}.json` files.
- **Scoped `ctx` IO** — `ctx.read` / `readText` / `write` / `exists` / `list` / `readAll` route
  through the run's storage; reaching for an undeclared asset throws.
- **Pluggable storage** — a `Storage` interface with a default `createFsStorage()`, injectable via
  `runPipeline(pipeline, { storage })`.
- New example: [`examples/word-stats`](./examples/word-stats).
- Fully additive — existing single-run steps, `ctx.reads`/`ctx.writes`, and the `readJson`/etc.
  helpers are unchanged.

### 0.1.0

Initial release — the core model.

- **`definePipeline(name, { assets, steps })`** — declare named **assets** and **steps**;
  validates the definition and returns a frozen `Pipeline`.
- **Derived execution order** — the run order is topologically derived from each step's
  `reads`/`writes`, so you never maintain a dependency map. Cycles throw `CycleError` up front.
- **Layers** — assets are organized `source → bronze → silver → gold`; `gold` is terminal.
- **`runPipeline(pipeline, { only?, logger? })`** — runs steps sequentially in derived order,
  handing each its resolved `reads`/`writes`. `only` restricts to a subset; `logger` is injectable.
- **Filesystem helpers** — `readText` / `writeText` / `readJson` / `writeJson`, accepting an asset
  or a path string.
- **Fail loudly** — a step that throws aborts the run; failures are never silently skipped.
- **Errors** — `ScriptPipeError`, `ValidationError`, `CycleError`. Dual ESM/CJS build.
- Example: [`examples/email-mail-merge`](./examples/email-mail-merge).

## License

MIT
