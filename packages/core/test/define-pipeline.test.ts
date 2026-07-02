import { describe, expect, it } from 'vitest';
import {
  CycleError,
  ValidationError,
  definePipeline,
  partitioned,
  type Asset,
  type Layer,
} from '../src/index';

const noop = (): void => {};

describe('definePipeline', () => {
  it('derives linear execution order from reads/writes regardless of declaration order', () => {
    const p = definePipeline('orders', {
      assets: {
        api: { layer: 'source', uri: 'https://x/api' },
        raw: { layer: 'bronze', uri: 'data/raw.json' },
        clean: { layer: 'silver', uri: 'data/clean.json' },
        published: { layer: 'gold', uri: 'data/pub.json' },
      },
      steps: {
        // Declared out of dependency order on purpose.
        publish: { reads: ['clean'], writes: ['published'], run: noop },
        clean: { reads: ['raw'], writes: ['clean'], run: noop },
        fetch: { reads: ['api'], writes: ['raw'], run: noop },
      },
    });

    expect(p.order).toEqual(['fetch', 'clean', 'publish']);
    expect(Object.isFrozen(p)).toBe(true);
  });

  it('orders a diamond graph so both branches precede the join', () => {
    const p = definePipeline('diamond', {
      assets: {
        a: { layer: 'bronze', uri: 'a' },
        b: { layer: 'silver', uri: 'b' },
        c: { layer: 'silver', uri: 'c' },
        d: { layer: 'gold', uri: 'd' },
      },
      steps: {
        start: { reads: [], writes: ['a'], run: noop },
        left: { reads: ['a'], writes: ['b'], run: noop },
        right: { reads: ['a'], writes: ['c'], run: noop },
        join: { reads: ['b', 'c'], writes: ['d'], run: noop },
      },
    });

    expect(p.order[0]).toBe('start');
    expect(p.order[p.order.length - 1]).toBe('join');
    expect(p.order.indexOf('left')).toBeLessThan(p.order.indexOf('join'));
    expect(p.order.indexOf('right')).toBeLessThan(p.order.indexOf('join'));
  });

  it('allows a step and an asset to share a name', () => {
    const p = definePipeline('shared', {
      assets: {
        raw: { layer: 'bronze', uri: 'raw' },
        cleanOrders: { layer: 'silver', uri: 'clean' },
      },
      steps: {
        cleanOrders: { reads: ['raw'], writes: ['cleanOrders'], run: noop },
      },
    });

    expect(p.order).toEqual(['cleanOrders']);
  });

  it('throws ValidationError on an unknown read asset', () => {
    expect(() =>
      definePipeline('bad', {
        assets: { a: { layer: 'bronze', uri: 'a' } },
        steps: { s: { reads: ['missing'], writes: ['a'], run: noop } },
      }),
    ).toThrow(ValidationError);
  });

  it('throws ValidationError on an unknown write asset', () => {
    expect(() =>
      definePipeline('bad', {
        assets: { a: { layer: 'bronze', uri: 'a' } },
        steps: { s: { reads: [], writes: ['missing'], run: noop } },
      }),
    ).toThrow(/unknown asset "missing"/);
  });

  it('throws ValidationError when two steps write the same asset', () => {
    expect(() =>
      definePipeline('bad', {
        assets: { a: { layer: 'bronze', uri: 'a' } },
        steps: {
          s1: { reads: [], writes: ['a'], run: noop },
          s2: { reads: [], writes: ['a'], run: noop },
        },
      }),
    ).toThrow(/single producer/);
  });

  it('throws ValidationError on an invalid layer', () => {
    const bad: Asset = { layer: 'platinum' as Layer, uri: 'a' };
    expect(() =>
      definePipeline('bad', {
        assets: { a: bad },
        steps: {},
      }),
    ).toThrow(/invalid layer/);
  });

  it('throws ValidationError on an empty name', () => {
    expect(() => definePipeline('  ', { assets: {}, steps: {} })).toThrow(
      ValidationError,
    );
  });

  it('throws CycleError on a dependency cycle', () => {
    let thrown: unknown;
    try {
      definePipeline('cyclic', {
        assets: {
          x: { layer: 'silver', uri: 'x' },
          y: { layer: 'silver', uri: 'y' },
        },
        steps: {
          a: { reads: ['y'], writes: ['x'], run: noop },
          b: { reads: ['x'], writes: ['y'], run: noop },
        },
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(CycleError);
    expect((thrown as CycleError).cycle.length).toBeGreaterThan(0);
  });

  it('accepts a valid partitioned step', () => {
    const p = definePipeline('fanout', {
      assets: {
        src: { layer: 'bronze', uri: 'src.json' },
        out: { layer: 'silver', uri: 'out', entries: true },
      },
      steps: {
        expand: partitioned<number>({
          reads: ['src'],
          writes: ['out'],
          concurrency: 2,
          partition: () => [1, 2, 3],
          key: (n) => String(n),
          run: (n) => ({ n }),
        }),
      },
    });
    expect(p.order).toEqual(['expand']);
  });

  it('throws when a partitioned step writes no collection asset', () => {
    expect(() =>
      definePipeline('bad', {
        assets: { out: { layer: 'silver', uri: 'out.json' } },
        steps: {
          expand: partitioned<number>({
            reads: [],
            writes: ['out'],
            partition: () => [1],
            key: (n) => String(n),
            run: (n) => ({ n }),
          }),
        },
      }),
    ).toThrow(/exactly one collection/);
  });

  it('throws when a partitioned step writes more than one collection asset', () => {
    expect(() =>
      definePipeline('bad', {
        assets: {
          a: { layer: 'silver', uri: 'a', entries: true },
          b: { layer: 'silver', uri: 'b', entries: true },
        },
        steps: {
          expand: partitioned<number>({
            reads: [],
            writes: ['a', 'b'],
            partition: () => [1],
            key: (n) => String(n),
            run: (n) => ({ n }),
          }),
        },
      }),
    ).toThrow(/exactly one collection/);
  });

  it('throws on a non-positive-integer concurrency', () => {
    expect(() =>
      definePipeline('bad', {
        assets: { out: { layer: 'silver', uri: 'out', entries: true } },
        steps: {
          expand: partitioned<number>({
            reads: [],
            writes: ['out'],
            concurrency: 0,
            partition: () => [1],
            key: (n) => String(n),
            run: (n) => ({ n }),
          }),
        },
      }),
    ).toThrow(/positive integer/);
  });

  it('throws when a partitioned step has no key function', () => {
    expect(() =>
      definePipeline('bad', {
        assets: { out: { layer: 'silver', uri: 'out', entries: true } },
        steps: {
          expand: {
            reads: [],
            writes: ['out'],
            partition: () => [1],
            run: () => ({}),
          } as never,
        },
      }),
    ).toThrow(/key function/);
  });
});
