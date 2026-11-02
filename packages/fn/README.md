# @dirty-geometry/fn

Pure functions shared by the geometry libraries: math, lists with callbacks, and seeded random numbers. It also holds the expression forms definitions are built from. Nothing here knows about geometry, and the package imports no other workspace package (a test checks this).

```ts
import { BINARY, compare } from '@dirty-geometry/fn/math';
import { generate, sortBy } from '@dirty-geometry/fn/lists';
import { white, jittered, smooth } from '@dirty-geometry/fn/random';
```

| Module   | What                                                                                                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `math`   | `UNARY` (`neg abs sign round floor ceil`, `sin cos tan cot asin acos atan acot` and `ln log2 log10`), `BINARY` (`+ - * / pow min max mod atan2`, floored `mod`), `compare('<' \| '>' \| '==', a, b, slack)`, `logic` |
| `lists`  | `generate(count, fn(index, previous, count), initial?)`, `map`, `filter`, `sortBy` (stable, number key, NaN last), `slice`, `at` (negative from the end); `GENERATE_LIMIT`                                           |
| `random` | `white(seed, index)`, `jittered(seed, index, count)`, `smooth(seed, t, scale?)`, all in `[0, 1)`; `hash32`                                                                                                           |
| `forms`  | the shared expression forms, generic over the host's expression type, with `formChildren` and `runForm`                                                                                                              |
| `calls`  | each form as a call (`toCall`, `fromCall`), for printing and parsing code                                                                                                                                            |
| `lib`    | the forms as plain functions named like their calls, so printed code runs                                                                                                                                            |

## Trigonometry

Angles are radians. `cot(x) = 1 / tan(x)` (so `cot(0)` is `Infinity`), `acot(x) = π/2 − atan(x)` (range (0, π), continuous at 0), and `atan2(y, x)` takes `y` first, like `Math.atan2`, giving (−π, π]. `asin` and `acos` return `null` outside −1…1 instead of NaN, so whatever uses the result fails with a message. `TRIG_OPS` and `ARC_OPS` name the two groups, for hosts that type trig operands apart from other math.

## Logarithms

`ln`, `log2` and `log10` return `null` for 0 and below (instead of `-Infinity` or NaN), like `asin`/`acos` outside −1…1. `LOG_OPS` names them.

## Random

Values are a hash of `(seed, index)` (lowbias32), with no state: the same seed and index always give the same value, in any order. A definition can be cached or partly re-run without its random values moving. The varieties go from fully random to smooth:

- `white`: every index independent; values can clump.
- `jittered`: `(index + white) / count`, one value in each of `count` equal slots, so no big gaps.
- `smooth`: value noise along `t`; nearby `t` give nearby values, one `scale` apart they are unrelated.

Saved definitions depend on the exact values, which `test/random.test.ts` pins. Do not change the hash; add a variety with a new name instead.

## Forms in a host language

A host's `Expr` union lists the form interfaces (`| UnaryMath<Expr> | BinaryMath<Expr> | …`). They are interfaces so the recursive union type-checks; `| SharedForm<Expr>` itself would be a circular alias. To evaluate one, the host calls `runForm(form, run, call)`: `run` evaluates an operand in the host's scope, and `call(name, args)` calls one of the host's functions with positional arguments. Typing and packing stay with the host (vec2: `schema/typing.ts` and `schema/dense/definition.ts`), since they depend on its types.
