# ScriptPipe

**TypeScript-native pipeline organization for Node.js.**

ScriptPipe turns a folder of loose scripts into a structured, layered pipeline. Each pipeline
declares its **assets** (named inputs/outputs), organizes them into **layers**
(`source → bronze → silver → gold`), and defines **steps** that read and write those assets.
Execution order is derived from the reads and writes — you don't maintain a dependency map.

It's code-first and stays out of your way: your business logic remains normal TypeScript or
JavaScript functions. Not a platform, not a notebook, not a visual builder.

## Install

> **⚠️ Not on npm yet — coming soon.** The command below is how you'll install it once
> published. For now, clone the repo and run the workspace locally.

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

## Try the example

[`examples/email-mail-merge`](./examples/email-mail-merge) — a 5-record email list that flows
`source → bronze → silver → gold` to produce mail-merged emails.

```bash
npm install
npm start -w @scriptpipe/example-email-mail-merge
```

Inspect `data/bronze/…` through `data/gold/…` to watch the records get captured, cleaned, and
rendered one layer at a time.

## JavaScript

ScriptPipe is written in TypeScript but works from CommonJS too:

```js
const { definePipeline } = require('@scriptpipe/core');
module.exports = definePipeline('orders', { assets: { /* … */ }, steps: { /* … */ } });
```

## Packages

npm-workspaces monorepo under `packages/*`. Nothing is published to npm yet — **coming soon.**

- **`@scriptpipe/core`** — define, validate, order, run, and read/write filesystem assets. _(built, not yet published)_
- **`@scriptpipe/cli`** — command-line runner. _(planned)_

The filesystem helpers live in `@scriptpipe/core` for now and may move to a dedicated
`@scriptpipe/fs` later; other backends (S3, Postgres) would arrive as their own adapters so
core stays backend-light.

## License

MIT
