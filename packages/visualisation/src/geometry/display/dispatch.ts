/** Handler per type tag; a missing tag is a compile error at the table's `satisfies` check. */
export type DispatchTable<G extends { readonly type: string }, Args extends unknown[], R> = {
  readonly [K in G['type']]: (value: Extract<G, { readonly type: K }>, ...args: Args) => R;
};

/** Call the handler registered for `value.type`. */
export function dispatchByType<G extends { readonly type: string }, Args extends unknown[], R>(
  table: DispatchTable<G, Args, R>,
  value: G,
  ...args: Args
): R {
  const handler = table[value.type as G['type']] as (value: G, ...args: Args) => R;
  return handler(value, ...args);
}
