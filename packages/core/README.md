# @scriptpipe/core

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

**Scoped IO.** A step's `ctx` also carries IO methods that route through the run's storage, so
you name an asset instead of a path:

```ts
export async function cleanOrders(ctx) {
  const raw = await ctx.read('rawOrders');        // JSON-parse the declared asset
  await ctx.write('cleanOrders', raw.map(normalizeOrder));
}
```

`ctx.read` / `ctx.readText` / `ctx.write` / `ctx.exists` / `ctx.list` / `ctx.readAll` all take an
asset **name** the step declared — reaching for an undeclared asset throws. Because they go
through storage, injecting a different backend (`runPipeline(pipeline, { storage })`) redirects
every step's IO without touching step code.

## Fan-out (partitioned) steps

A **partitioned** step processes many items independently — the engine drives the loop, names
each output, and runs items concurrently. Declare `partition` (the items), `key` (each item's
output name), and an optional `concurrency` (default 1, i.e. sequential):

```ts
import { definePipeline, partitioned } from '@scriptpipe/core';

definePipeline('reports', {
  assets: {
    accounts:    { layer: 'bronze', uri: 'data/bronze/accounts.json' },
    reports:     { layer: 'silver', uri: 'data/silver/reports', entries: true }, // a collection
    rollup:      { layer: 'gold',   uri: 'data/gold/rollup.json' },
  },
  steps: {
    buildReports: partitioned({
      reads: ['accounts'],
      writes: ['reports'],                              // must be exactly one `entries` asset
      concurrency: 4,                                   // up to 4 items in flight
      partition: (ctx) => ctx.read('accounts'),        // → the items
      key: (account) => account.id,                    // → reports/{id}.json
      run: (account) => buildReport(account),          // ONE item; its return is written for you
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
whatever `run(item, ctx)` returns to `<uri>/<key>.json`; return `undefined` to opt out and write
yourself with `ctx.write(asset, key, value)`. Downstream steps read the whole collection back with
`ctx.readAll` / `ctx.list`. Concurrency is scoped to a single step — steps never touch `Promise.all`
themselves. Duplicate keys and empty/`/`-containing keys throw.

`partitioned<Item>({ … })` is a typed authoring helper: `Item` is inferred from `partition`, so
`key` and `run` see the real item type. A plain object literal works too, but its items are typed
`unknown`.

## API

- `definePipeline(name, { assets, steps })` → validates the definition, derives execution
  order, and returns a frozen `Pipeline`. Throws `ValidationError` (bad references, duplicate
  producers, malformed partitioned steps) or `CycleError` (dependency cycle) up front.
- `partitioned<Item>({ reads, writes, partition, key, run, concurrency? })` → author a fan-out
  step with full item-type inference. Drops straight into a pipeline's `steps` map.
- `runPipeline(pipeline, { only?, logger?, storage? })` → runs steps in derived order and returns
  `{ pipeline, steps }`. Pass `storage` to swap the filesystem backend.
- `createFsStorage()` → the default `Storage` (local filesystem). Implement the `Storage`
  interface (`readText` / `writeText` / `exists` / `list` / `remove`) for other backends.
- `readText` / `writeText` / `readJson` / `writeJson` → filesystem helpers that accept an
  asset or a path string.
- `ctx` IO: `read` / `readText` / `write` / `exists` / `list` / `readAll` — asset-name-scoped IO
  routed through the run's storage.
- Errors: `ScriptPipeError`, `ValidationError`, `CycleError`. Types: `Layer`, `Asset`, `Step`,
  `SimpleStep`, `PartitionedStep`, `StepContext`, `Storage`, `Pipeline`, and more.

## JavaScript

Written in TypeScript, but works from CommonJS too:

```js
const { definePipeline } = require('@scriptpipe/core');
module.exports = definePipeline('orders', { assets: { /* … */ }, steps: { /* … */ } });
```

## Release notes

### 0.2.0

- **Partitioned (fan-out) steps** — `partitioned({ partition, key, run, concurrency })`. The
  engine drives the per-item loop, names each output, and runs items with bounded concurrency.
- **Collection assets** — `entries: true` marks an asset as a directory of `{key}.json` files.
- **Scoped `ctx` IO** — `ctx.read` / `readText` / `write` / `exists` / `list` / `readAll` route
  through the run's storage; reaching for an undeclared asset throws.
- **Pluggable storage** — a `Storage` interface with a default `createFsStorage()`, injectable via
  `runPipeline(pipeline, { storage })`.
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

## Links

- Repository & runnable examples: https://github.com/scottpreston/scriptpipe
- Homepage: https://scriptpipe.dev

## License

MIT
