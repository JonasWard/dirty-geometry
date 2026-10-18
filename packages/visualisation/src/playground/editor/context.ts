/** What an expression editor needs from where its expression stands. */
import type { Expr, Fn } from '@dirty-geometry/vec2/recording/definition';
import type { ExprPath } from '@dirty-geometry/vec2/recording/expr';
import type { Type } from '@dirty-geometry/vec2/schema/schema';
import type { Scope } from '../model/ops';

export type Editing = {
  /** The names that can be referred to here, with their types. */
  scope: Scope;
  /** The user functions that can be called here. */
  fns: readonly Fn[];
  /** An expression's type here. */
  typeOf: (e: Expr) => Type;
  /** Problems by path (`args.center`), from the type check. */
  issues: ReadonlyMap<string, string[]>;
  /** Replace the expression at `path` (`undefined` leaves an argument out); `coalesce` merges quick edits into one undo step. */
  set: (path: ExprPath, e: Expr | undefined, options?: { coalesce?: string }) => void;
  /** Make the expression at `path` a cell of its own (cells only). */
  extract?: (path: ExprPath) => void;
  /** For labels: the cell or function being edited. */
  label: string;
};

export const pathKey = (path: ExprPath) => path.join('.');
