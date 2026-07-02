import { describe, expect, it } from 'vitest';
import { definePipeline, partitioned, runPipeline } from '../src/index';
import { memStorage, silentLogger } from './mem-storage';

interface Item {
  id: string;
  n: number;
}

const items: Item[] = [
  { id: 'a', n: 1 },
  { id: 'b', n: 2 },
  { id: 'c', n: 3 },
];

describe('partitioned steps', () => {
  it('fans out, names each output by key, and a downstream step reads the collection back', async () => {
    const storage = memStorage();

    const p = definePipeline('doubler', {
      assets: {
        doubled: { layer: 'silver', uri: 'mem/doubled', entries: true },
        total: { layer: 'gold', uri: 'mem/total.json' },
      },
      steps: {
        double: partitioned<Item>({
          reads: [],
          writes: ['doubled'],
          partition: () => items,
          key: (item) => item.id,
          run: (item) => ({ id: item.id, value: item.n * 2 }),
        }),
        sum: {
          reads: ['doubled'],
          writes: ['total'],
          run: async (ctx) => {
            const all = await ctx.readAll<{ id: string; value: number }>('doubled');
            const sum = all.reduce((acc, x) => acc + x.value, 0);
            await ctx.write('total', { sum });
          },
        },
      },
    });

    const result = await runPipeline(p, { logger: silentLogger, storage });

    // One file per item, keyed by id.
    expect(JSON.parse(storage.files.get('mem/doubled/a.json')!)).toEqual({
      id: 'a',
      value: 2,
    });
    expect(JSON.parse(storage.files.get('mem/doubled/c.json')!)).toEqual({
      id: 'c',
      value: 6,
    });
    // Downstream aggregate over the whole collection: (1+2+3) * 2 = 12.
    expect(JSON.parse(storage.files.get('mem/total.json')!)).toEqual({ sum: 12 });

    const doubleResult = result.steps.find((s) => s.step === 'double')!;
    expect(doubleResult.items).toBe(3);
  });

  it('runs at most `concurrency` items in flight at once', async () => {
    const storage = memStorage();
    let inFlight = 0;
    let maxInFlight = 0;
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `k${i}`, n: i }));

    const p = definePipeline('bounded', {
      assets: { out: { layer: 'silver', uri: 'mem/out', entries: true } },
      steps: {
        work: partitioned<{ id: string; n: number }>({
          reads: [],
          writes: ['out'],
          concurrency: 2,
          partition: () => many,
          key: (item) => item.id,
          run: async (item) => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 5));
            inFlight -= 1;
            return { id: item.id };
          },
        }),
      },
    });

    await runPipeline(p, { logger: silentLogger, storage });
    expect(maxInFlight).toBe(2);
    expect(storage.files.size).toBe(6);
  });

  it('preserves item order in the step result regardless of concurrency', async () => {
    const storage = memStorage();
    const p = definePipeline('ordered', {
      assets: { out: { layer: 'silver', uri: 'mem/out', entries: true } },
      steps: {
        work: partitioned<Item>({
          reads: [],
          writes: ['out'],
          concurrency: 3,
          partition: () => items,
          key: (item) => item.id,
          // Reverse the delay so 'a' finishes last if order were by completion.
          run: async (item) => {
            await new Promise((resolve) => setTimeout(resolve, (4 - item.n) * 5));
            return { id: item.id };
          },
        }),
      },
    });

    const result = await runPipeline(p, { logger: silentLogger, storage });
    const workResult = result.steps[0]!.result as { id: string }[];
    expect(workResult.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not auto-write when run returns undefined (step does its own IO)', async () => {
    const storage = memStorage();
    const p = definePipeline('own-io', {
      assets: { out: { layer: 'silver', uri: 'mem/out', entries: true } },
      steps: {
        work: partitioned<Item>({
          reads: [],
          writes: ['out'],
          partition: () => items,
          key: (item) => item.id,
          run: async (item, ctx) => {
            await ctx.write('out', item.id, { manual: item.id });
            return undefined;
          },
        }),
      },
    });

    await runPipeline(p, { logger: silentLogger, storage });
    expect(JSON.parse(storage.files.get('mem/out/b.json')!)).toEqual({ manual: 'b' });
    expect(storage.files.size).toBe(3);
  });

  it('throws when two items map to the same key', async () => {
    const storage = memStorage();
    const p = definePipeline('dup', {
      assets: { out: { layer: 'silver', uri: 'mem/out', entries: true } },
      steps: {
        work: partitioned<Item>({
          reads: [],
          writes: ['out'],
          partition: () => [
            { id: 'x', n: 1 },
            { id: 'x', n: 2 },
          ],
          key: (item) => item.id,
          run: (item) => ({ n: item.n }),
        }),
      },
    });

    await expect(runPipeline(p, { logger: silentLogger, storage })).rejects.toThrow(
      /duplicate key "x"/,
    );
  });

  it('throws on an empty or slash-containing key', async () => {
    const storage = memStorage();
    const p = definePipeline('badkey', {
      assets: { out: { layer: 'silver', uri: 'mem/out', entries: true } },
      steps: {
        work: partitioned<Item>({
          reads: [],
          writes: ['out'],
          partition: () => [{ id: 'a/b', n: 1 }],
          key: (item) => item.id,
          run: (item) => ({ n: item.n }),
        }),
      },
    });

    await expect(runPipeline(p, { logger: silentLogger, storage })).rejects.toThrow(
      /must not contain "\/"/,
    );
  });
});
