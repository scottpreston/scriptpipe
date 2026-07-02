import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFsStorage } from '../src/index';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'pw-storage-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('createFsStorage', () => {
  it('writes (creating parents), reads, and reports existence', () => {
    const storage = createFsStorage();
    const uri = join(dir, 'nested/deep/a.json');
    expect(storage.exists(uri)).toBe(false);
    storage.writeText(uri, 'hello');
    expect(storage.exists(uri)).toBe(true);
    expect(storage.readText(uri)).toBe('hello');
  });

  it('lists entries under a directory and removes recursively', () => {
    const storage = createFsStorage();
    const collDir = join(dir, 'coll');
    storage.writeText(join(collDir, 'a.json'), '1');
    storage.writeText(join(collDir, 'b.json'), '2');
    expect(storage.list(collDir).sort()).toEqual(['a.json', 'b.json']);

    storage.remove(collDir);
    expect(storage.exists(collDir)).toBe(false);
  });

  it('throws on an empty uri instead of failing silently', () => {
    const storage = createFsStorage();
    expect(() => storage.readText('')).toThrow(/non-empty uri/);
  });

  it('remove is a no-op on an absent location', () => {
    const storage = createFsStorage();
    expect(() => storage.remove(join(dir, 'does-not-exist'))).not.toThrow();
  });
});
