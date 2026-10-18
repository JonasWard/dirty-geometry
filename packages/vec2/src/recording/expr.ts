/** Walking and rebuilding expressions. A path is the keys from an expression down to one inside it. */
import type { Expr } from './definition';

/** `['args', 'center']`, `['self']`, `['args', 'vertices', 2]`, `['object', 'mesh']`, `['of']`, `['args', 0]` (math). */
export type ExprPath = (string | number)[];

/** The expressions directly inside `e`, with the path step to each. */
export function children(e: Expr): { path: ExprPath; expr: Expr }[] {
  if (e === null || typeof e !== 'object') return [];
  if (Array.isArray(e)) return e.map((expr, i) => ({ path: [i], expr }));
  if ('object' in e) return Object.entries(e.object).map(([k, expr]) => ({ path: ['object', k], expr }));
  if ('op' in e)
    return [
      ...(e.self !== undefined ? [{ path: ['self'], expr: e.self }] : []),
      ...Object.entries(e.args ?? {}).map(([k, expr]) => ({ path: ['args', k], expr })),
    ];
  if ('call' in e) return Object.entries(e.args ?? {}).map(([k, expr]) => ({ path: ['args', k], expr }));
  if ('math' in e) return e.args.map((expr, i) => ({ path: ['args', i], expr: expr as Expr }));
  if ('of' in e) return [{ path: ['of'], expr: e.of }];
  return [];
}

/** Every expression in `e` (itself first), with its path. */
export function* walk(e: Expr, path: ExprPath = []): Generator<{ path: ExprPath; expr: Expr }> {
  yield { path, expr: e };
  for (const child of children(e)) yield* walk(child.expr, [...path, ...child.path]);
}

/** The expression at `path`, or undefined. */
export const getAt = (e: Expr, path: ExprPath): Expr | undefined =>
  path.reduce<any>((at, key) => (at === null || typeof at !== 'object' ? undefined : at[key]), e);

/** `e` with the expression at `path` replaced (`undefined` removes an argument or field). */
export function setAt(e: Expr, path: ExprPath, value: Expr | undefined): Expr {
  if (path.length === 0) return value ?? null;
  const [head, ...rest] = path as [string | number, ...ExprPath];
  const node = (e ?? {}) as any;
  const inner = rest.length === 0 ? value : setAt(node[head], rest, value);
  if (Array.isArray(node)) {
    const list = [...node];
    if (inner === undefined) list.splice(head as number, 1);
    else list[head as number] = inner;
    return list;
  }
  const next = { ...node };
  if (inner === undefined) delete next[head];
  else next[head] = inner;
  // An empty `args` record is left out, as in packed and parsed definitions.
  if (head === 'args' && next.args && !Array.isArray(next.args) && Object.keys(next.args).length === 0)
    delete next.args;
  return next;
}

/** `e` rebuilt bottom-up through `f`. */
export function mapExpr(e: Expr, f: (e: Expr) => Expr): Expr {
  let next = e;
  for (const child of children(e)) next = setAt(next, child.path, mapExpr(child.expr, f));
  return f(next);
}

/** The names `e` refers to (inputs, cells, params), and the user functions it calls. */
export function uses(e: Expr): { refs: Set<string>; calls: Set<string> } {
  const refs = new Set<string>();
  const calls = new Set<string>();
  for (const { expr } of walk(e)) {
    if (expr && typeof expr === 'object' && !Array.isArray(expr)) {
      if ('ref' in expr) refs.add(expr.ref);
      if ('call' in expr) calls.add(expr.call);
    }
  }
  return { refs, calls };
}
