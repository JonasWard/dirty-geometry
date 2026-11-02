import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// fn is shared by the geometry libraries, so it may import nothing but itself.
test('fn imports only its own modules', () => {
  const src = path.join(import.meta.dir, '../src');
  const outside = readdirSync(src).flatMap((file) =>
    [...readFileSync(path.join(src, file), 'utf8').matchAll(/from '([^']+)'/g)]
      .map((m) => m[1]!)
      .filter((spec) => !spec.startsWith('./'))
      .map((spec) => `${file}: ${spec}`),
  );
  expect(outside).toEqual([]);
});
