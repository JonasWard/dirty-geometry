import type { Source } from './definition';

/** A recorded number / string / boolean that remembers its source; arithmetic on it gives plain literals. */
export class Scalar<T extends number | string | boolean = number> {
  constructor(
    readonly node: Source,
    readonly value: T,
  ) {}
  valueOf = (): T => this.value;
  toJSON = this.valueOf;
  [Symbol.toPrimitive] = this.valueOf;
  toString = () => String(this.value);
}
