/**
 * A recorded scalar: the result of a vec2 operation (or a param) that keeps a link to the node that made it.
 *
 * Plain numbers cannot carry where they came from, so the recorder returns `Scalar`s instead. Passing one
 * into another recorded operation records the dependency. `valueOf()` lets arithmetic and comparisons
 * (`len * 2`, `len > 1`) work, but their results are plain numbers and are recorded as literals. A boxed
 * value is an object: read `.value` for `===`, truthiness and `typeof` checks.
 */
export class Scalar<T extends number | string | boolean = number> {
  constructor(
    readonly node: string,
    readonly value: T,
  ) {
    Object.freeze(this);
  }

  valueOf(): T {
    return this.value;
  }

  toString(): string {
    return String(this.value);
  }

  toJSON(): T {
    return this.value;
  }

  [Symbol.toPrimitive](): T {
    return this.value;
  }
}
