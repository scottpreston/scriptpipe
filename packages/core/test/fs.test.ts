import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readJson, readText, writeJson, writeText } from '../src/index';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'pw-fs-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('fs helpers', () => {
  it('round-trips JSON', () => {
    const target = join(dir, 'a.json');
    writeJson(target, { hello: 'world', n: 5 });
    expect(readJson<{ hello: string; n: number }>(target)).toEqual({
      hello: 'world',
      n: 5,
    });
  });

  it('creates parent directories when writing text', () => {
    const target = join(dir, 'nested/deep/file.txt');
    writeText(target, 'hi');
    expect(readText(target)).toBe('hi');
  });

  it('accepts a ResolvedAsset-shaped target, not just a string', () => {
    const asset = { name: 'x', layer: 'gold' as const, uri: join(dir, 'asset.json') };
    writeJson(asset, [1, 2, 3]);
    expect(readJson<number[]>(asset)).toEqual([1, 2, 3]);
  });

  it('throws on an empty uri instead of failing silently', () => {
    expect(() => readText('')).toThrow(/non-empty uri/);
  });
});
