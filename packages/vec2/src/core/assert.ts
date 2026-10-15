/** Exhaustiveness check for `switch (value.type)`: a missing case becomes a compile error. */
export function assertNever(value: never, message = 'Unhandled case'): never {
  throw new Error(`${message}: ${JSON.stringify((value as { type?: unknown })?.type ?? value)}`);
}
