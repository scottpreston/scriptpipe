import { describe, expect, it } from 'vitest';
import {
  definePipeline,
  runPipeline,
  type Logger,
  type StepContext,
} from '../src/index';

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

describe('runPipeline', () => {
  it('runs steps in derived order and hands each its resolved reads/writes', async () => {
    const seen: string[] = [];

    const p = definePipeline('orders', {
      assets: {
        raw: { layer: 'bronze', uri: 'data/raw.json' },
        clean: { layer: 'silver', uri: 'data/clean.json' },
      },
      steps: {
        clean: {
          reads: ['raw'],
          writes: ['clean'],
          run: (ctx: StepContext) => {
            seen.push(ctx.step);
            expect(ctx.reads.raw).toEqual({
              name: 'raw',
              layer: 'bronze',
              uri: 'data/raw.json',
            });
            expect(ctx.writes.clean?.uri).toBe('data/clean.json');
            return 'cleaned';
          },
        },
        fetch: {
          reads: [],
          writes: ['raw'],
          run: (ctx: StepContext) => {
            seen.push(ctx.step);
            return 'fetched';
          },
        },
      },
    });

    const result = await runPipeline(p, { logger: silentLogger });

    expect(seen).toEqual(['fetch', 'clean']);
    expect(result.pipeline).toBe('orders');
    expect(result.steps.map((s) => s.step)).toEqual(['fetch', 'clean']);
    expect(result.steps.map((s) => s.result)).toEqual(['fetched', 'cleaned']);
  });

  it('respects the only option and still runs in derived order', async () => {
    const seen: string[] = [];

    const p = definePipeline('p', {
      assets: {
        a: { layer: 'bronze', uri: 'a' },
        b: { layer: 'silver', uri: 'b' },
      },
      steps: {
        one: {
          reads: [],
          writes: ['a'],
          run: (c: StepContext) => {
            seen.push(c.step);
          },
        },
        two: {
          reads: ['a'],
          writes: ['b'],
          run: (c: StepContext) => {
            seen.push(c.step);
          },
        },
      },
    });

    await runPipeline(p, { only: ['two'], logger: silentLogger });
    expect(seen).toEqual(['two']);
  });

  it('propagates step errors instead of swallowing them', async () => {
    const p = definePipeline('p', {
      assets: { a: { layer: 'bronze', uri: 'a' } },
      steps: {
        boom: {
          reads: [],
          writes: ['a'],
          run: () => {
            throw new Error('kaboom');
          },
        },
      },
    });

    await expect(runPipeline(p, { logger: silentLogger })).rejects.toThrow(
      'kaboom',
    );
  });

  it('throws when only names an unknown step', async () => {
    const p = definePipeline('p', {
      assets: { a: { layer: 'bronze', uri: 'a' } },
      steps: { one: { reads: [], writes: ['a'], run: () => {} } },
    });

    await expect(
      runPipeline(p, { only: ['nope'], logger: silentLogger }),
    ).rejects.toThrow(/unknown step "nope"/);
  });

  it('awaits async step run functions', async () => {
    const p = definePipeline('p', {
      assets: { a: { layer: 'bronze', uri: 'a' } },
      steps: {
        one: {
          reads: [],
          writes: ['a'],
          run: async () => {
            return await Promise.resolve(42);
          },
        },
      },
    });

    const result = await runPipeline(p, { logger: silentLogger });
    expect(result.steps[0]?.result).toBe(42);
  });
});
