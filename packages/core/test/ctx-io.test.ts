import { describe, expect, it } from 'vitest';
import { definePipeline, runPipeline } from '../src/index';
import { memStorage, silentLogger } from './mem-storage';

describe('scoped ctx IO', () => {
  it('reads and writes single-file assets through storage', async () => {
    const storage = memStorage();
    storage.files.set('mem/in.json', JSON.stringify({ hello: 'world' }));

    const p = definePipeline('io', {
      assets: {
        in: { layer: 'bronze', uri: 'mem/in.json' },
        out: { layer: 'silver', uri: 'mem/out.json' },
      },
      steps: {
        transform: {
          reads: ['in'],
          writes: ['out'],
          run: async (ctx) => {
            const input = await ctx.read<{ hello: string }>('in');
            expect(await ctx.exists('in')).toBe(true);
            expect(await ctx.exists('out')).toBe(false);
            await ctx.write('out', { greeting: input.hello.toUpperCase() });
          },
        },
      },
    });

    await runPipeline(p, { logger: silentLogger, storage });
    expect(JSON.parse(storage.files.get('mem/out.json')!)).toEqual({ greeting: 'WORLD' });
  });

  it('lists and reads all items of a collection asset', async () => {
    const storage = memStorage();
    storage.files.set('mem/coll/a.json', JSON.stringify({ v: 1 }));
    storage.files.set('mem/coll/b.json', JSON.stringify({ v: 2 }));

    const p = definePipeline('coll', {
      assets: {
        coll: { layer: 'silver', uri: 'mem/coll', entries: true },
        out: { layer: 'gold', uri: 'mem/out.json' },
      },
      steps: {
        agg: {
          reads: ['coll'],
          writes: ['out'],
          run: async (ctx) => {
            const keys = await ctx.list('coll');
            expect(keys.sort()).toEqual(['a', 'b']);
            const all = await ctx.readAll<{ v: number }>('coll');
            await ctx.write('out', { sum: all.reduce((acc, x) => acc + x.v, 0) });
          },
        },
      },
    });

    await runPipeline(p, { logger: silentLogger, storage });
    expect(JSON.parse(storage.files.get('mem/out.json')!)).toEqual({ sum: 3 });
  });

  it('throws when a step reaches for an asset it did not declare', async () => {
    const storage = memStorage();
    storage.files.set('mem/a.json', '1');
    const p = definePipeline('undeclared', {
      assets: {
        a: { layer: 'bronze', uri: 'mem/a.json' },
        b: { layer: 'bronze', uri: 'mem/b.json' },
      },
      steps: {
        s: {
          reads: ['a'],
          writes: [],
          run: (ctx) => ctx.read('b'),
        },
      },
    });

    await expect(runPipeline(p, { logger: silentLogger, storage })).rejects.toThrow(
      /did not declare in its reads/,
    );
  });

  it('throws when list/readAll is used on a single-file asset', async () => {
    const storage = memStorage();
    storage.files.set('mem/a.json', '1');
    const p = definePipeline('wrong-shape', {
      assets: { a: { layer: 'bronze', uri: 'mem/a.json' } },
      steps: {
        s: { reads: ['a'], writes: [], run: (ctx) => ctx.list('a') },
      },
    });

    await expect(runPipeline(p, { logger: silentLogger, storage })).rejects.toThrow(
      /not a collection/,
    );
  });

  it('throws when read is used on a collection asset', async () => {
    const storage = memStorage();
    const p = definePipeline('wrong-shape-2', {
      assets: { c: { layer: 'silver', uri: 'mem/c', entries: true } },
      steps: {
        s: { reads: ['c'], writes: [], run: (ctx) => ctx.read('c') },
      },
    });

    await expect(runPipeline(p, { logger: silentLogger, storage })).rejects.toThrow(
      /is a collection/,
    );
  });
});
