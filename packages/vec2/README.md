# @dirty-geometry/vec2

A 2D geometry library. Source-only TypeScript with no barrel: import each module by its path.

```ts
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { ConstrainedDelaunay } from '@dirty-geometry/vec2/operations/constrained-delaunay';
```

## Layout

Folders are layered. A module may only import from its own layer or a lower one, and `test/architecture` enforces this along with a no-new-cycles rule.

| Layer | Folders                              | What                                                                                                                                                                                                                                                          |
| ----- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | `core/epsilon`, `hash/`, `analysis/` | tolerances, spatial hashing, clustering                                                                                                                                                                                                                       |
| 1     | `core/`, `bounds/interval2`          | `Vec2`, `Angle`, `Mat3`, `Frame2`, exact predicates, intervals                                                                                                                                                                                                |
| 2     | `bounds/aabb2`, `spatial/`           | boxes, vertex dedup                                                                                                                                                                                                                                           |
| 3     | `geometry/`                          | primitives (`Line2`, `Arc2`, `Ray2`, `InfiniteLine2`, `Hesse2`), curves (`Polyline2`, `ArcPolyline2`), regions (`Polygon2`, `ArcPolygon2`, `Circle2`, `TriMesh2`), type tags and guards in `geometry/kinds`                                                   |
| 4     | `grid/`                              | `Grid2`, axes, cells and grid regions                                                                                                                                                                                                                         |
| 5     | `operations/`                        | static-only classes: `Boolean2` (also on arcs, exact or approximate), `Contains2`, `Overlap2`, `Intersection2`, `DouglasPeucker`, `ConstrainedDelaunay`, `RectilinearGrid2`, `ConvexDecomposition2`, `Minkowski2`; their plumbing (CDT core, constraint edges, grid paths, convex pieces) in `operations/helpers/` |
| 6     | `io/`                                | JSON codecs                                                                                                                                                                                                                                                   |
| 7     | `recording/`                         | definitions: cells of expressions, their evaluation, recording calls by reflection, migration from version 3 (reads only the generated schema; nothing else imports it)                                                                                       |

`examples/` holds the scenario data behind the `/lab` demos, plus a seeded RNG (`examples/random`). `src` never imports from it.

## Conventions

- **Values are immutable.** Fields are `readonly`, shared constants are frozen, and methods return new values (`interval.including(v)`).
- **Parameter names:** `other` for a second value of the same type (`v.add(other)`), `a, b` for symmetric pairs (`Overlap2.overlaps(a, b)`), `point` for a query point, `matrix` for a `Mat3`, `factor` for a scale, `radians` for raw angles, `value` for a scalar on an interval, `slack` for an optional `Epsilon` tolerance, `points` for unordered point sets and `vertices` for ordered ones.
- **Number types.** Parameters and JSON fields that store a number say what it is, with a type from `core/numbers.ts`: `Coordinate`, `Length` (non-negative), `Radians`, `Parameter` (0 to 1 along a curve), `Integer`, `Index` (non-negative) or `Tolerance`. They are plain `number`s; the schema generator reads the names, and dense packing uses their ranges.
- **Dispatch uses the `type` tag.** Every geometry class has `static type` and a matching `get type()`, so `switch (g.type)` narrows `Geometry2`. The guards are in `geometry/kinds`.
- **Tolerances:**
  - `Epsilon` is a length (default `1e-6`). `preferIn` and `preferOut` decide which way boundary cases fall.
  - Parameter tolerances are `Epsilon.parameter(length)`.
  - Orientation and in-circle tests are exact (`core/predicates`).
- **Angle precision is in degrees**, for both hashing and `equals`.
- **Hash scale:** `Vec2.hash(scale)` and `hash2scale` quantise to `scale` and wrap after 2²⁶ buckets per axis. Set `scale` to the coordinate precision of your data.
- **Grid limits:** grid indices are limited to ±2²⁵ (`grid/core/limits`). That is the 26-bit cell hash, and the default for unconstrained axes.
- **JSON:**
  - `toJson()` on every type.
  - `io/default-registry` decodes any of them.
  - Register your own types on a `CodecRegistry` from `io/codec`.
  - ±Infinity is written as `"Infinity"` / `"-Infinity"`.

## Arcs

`Arc2` is the curved counterpart of `Line2`: two end points and a signed **sagitta**, the height of the arc's midpoint above the chord's midpoint along the chord's left normal.

- `sagitta > 0`: the arc bulges left of `from → to` and turns clockwise. `sagitta < 0`: it bulges right and turns counter-clockwise.
- `|sagitta|` below, at or above half the chord: a minor arc, a half circle or a major arc.
- Radius, centre, sweep and length are derived on demand. JSON is `{ type: 'Arc2', from, to, sagitta }`.
- A sagitta within epsilon is straight: `segmentOf(from, to, sagitta, epsilon)` returns a `Line2` or an `Arc2`.

`ArcPolyline2` (open) and `ArcPolygon2` (closed, a region) store vertices plus one sagitta per segment, exactly 0 for a straight one. They offset with mitred joins, slice by arc length, and sample to `Polyline2` / `Polygon2`. `Contains2` and `Overlap2` handle all three exactly. `Boolean2` takes `ArcPolygon2` and `Circle2` too: with `arcs: { mode: 'exact' }` (the default) the result keeps its arcs and comes back as `regions`; with `{ mode: 'approximate', chordTolerance }` arcs become chords and the result is `polygons`, as for straight inputs.

## Minkowski sums

`Minkowski2` adds every point of one shape to every point of the other. Shapes are loops as for `Boolean2` (counter-clockwise outer loops, clockwise holes); results are `Boolean2Result`s.

- `convexSum(a, b)`: two convex polygons, merged edge by edge in O(n + m) with exact angle order. `sumPoints` (the hull of all pairwise sums) is its slow reference.
- `convexSumDisc(polygon, radius)` and `sumDisc(shape, radius)`: the rounded offset, with exact arcs in `regions`. A non-convex shape is united with a capsule around every edge.
- `sum(a, b)`: any shapes. Each is split into convex pieces (loops that are already convex are used as they are, otherwise `ConvexDecomposition2.decompose`, below), the pieces are summed pairwise and united. That is |pieces of a| · |pieces of b| sums; past `maxPieces` (default 20 000) it throws.
- `sumNegated(a, b)` is `a ⊕ (−b)`, the offsets at which `b` meets `a`. `erode(a, b)` is `a ⊖ b`, the points `x` where `x + b` fits in `a`, built from the complement of `a` in a box.

## Convex decomposition

`ConvexDecomposition2.decompose(loops)` splits a region (loops as for `Boolean2`, holes included) into convex, counter-clockwise pieces that tile it without overlapping:

1. **Triangulate.** `Boolean2.union(loops, { mesh: true })` gives the constrained Delaunay triangles inside the region; triangles in holes are left out.
2. **Merge** (Hertel–Mehlhorn, `fromMesh`). Every triangle starts as a piece. For each edge shared by two pieces, the two are joined without that edge if both of its ends still turn convex (exact orientation tests). Removing an edge can only break convexity at its ends, so no other corner is checked.

The result has at most four times the fewest possible pieces. Which pieces come out depends on the triangulation: an L becomes two rectangles, a comb its teeth and its base. A single convex loop comes back as itself.

## Constrained Delaunay

`ConstrainedDelaunay.triangulate(points, constraints)` dedups the points, splits crossing constraints and returns a `TriMesh2`. `ConstrainedDelaunay.report` returns the same mesh plus:

- the constraints it could not insert;
- operation counts (`orient`, `inCircle`, `flips`, `walkSteps`).

The core (`operations/helpers/cdt/`) is an adjacency mesh with walking point location, Bowyer–Watson insertion in Morton order, constraint insertion by flips, and exact predicates.

## Definitions

A definition (version 4) says _how_ values are made, as data: typed **inputs**, user **functions**, and named **cells**, each holding one expression. Cells flagged `output` are the result, each with its declared `type`.

```ts
import type { Definition } from '@dirty-geometry/vec2/recording/definition';
import { evaluate } from '@dirty-geometry/vec2/recording/evaluate';

const definition: Definition = {
  format: 'vec2-definition',
  version: 4,
  inputs: [{ name: 'width', type: 'Coordinate', value: 3 }],
  functions: [
    {
      name: 'at',
      params: [{ name: 'x', type: 'Coordinate' }],
      body: { op: 'Vec2.new', args: { x: { ref: 'x' }, y: 4 } },
    },
  ],
  cells: [
    {
      name: 'line',
      expr: {
        op: 'Line2.new',
        args: { from: { op: 'Vec2.new', args: { x: 0, y: 0 } }, to: { call: 'at', args: { x: { ref: 'width' } } } },
      },
    },
    {
      name: 'end',
      expr: {
        op: 'Vec2.scale',
        self: { op: 'Vec2.new', args: { x: 1, y: 0 } },
        args: { factor: { op: 'Line2.length', self: { ref: 'line' } } },
      },
      type: 'Vec2',
      output: true,
    },
  ],
};
const { outputs, cells } = evaluate(definition, { inputs: { width: 6 } }); // run with a new width
```

- **Expressions** (`recording/definition.ts`) nest: an operation (`{ op: 'Vec2.add', self, args }`, args by parameter name, a rest parameter as a list, a left-out optional without a key), a user function call (`{ call, args }`), a name (`{ ref }`: an input, an earlier cell, or a function param), an item or field of a result (`{ of, index }`, `{ of, field }`), the shared forms from `@dirty-geometry/fn` (below), literals, lists, options objects (`{ object }`), stored vec2 values (`{ value: toJson() }`) and `{ number: 'Infinity' }`. A cell may refer to the inputs and the cells before it; a function body only to its params and the functions before it, so there are no cycles. `recording/expr.ts` walks and rebuilds expressions by path.
- **Shared forms** come from [`@dirty-geometry/fn`](../fn/README.md), so a later Vec3 library can use the same ones; vec2 types and packs them.
  - Math: `{ math: '+' | '-' | '*' | '/' | 'pow' | 'min' | 'max' | 'mod', args: [a, b] }` and `{ math: 'neg' | 'abs' | 'sign' | 'round' | 'floor' | 'ceil', args: [x] }`. Numbers are generic: an operand packs as the number type of the slot the math stands in.
  - Trigonometry: `{ math: 'sin' | 'cos' | 'tan' | 'cot' | 'asin' | 'acos' | 'atan' | 'acot', args: [x] }` and `{ math: 'atan2', args: [y, x] }` (radians in (−π, π]). `asin` and `acos` are `null` outside −1…1 (typed `number | null`), so the cell that uses the result fails; `acot` is `π/2 − atan`, in (0, π). Trigonometry types its operands itself: `sin`…`cot` pack theirs as `Radians`, the arc functions and `atan2` as numbers (`Coordinate`).
  - Logarithms: `{ math: 'ln' | 'log2' | 'log10', args: [x] }`, `null` for 0 and below (typed `number | null`). Their operand packs as a number (`Coordinate`), like the arc functions'.
  - Booleans: `{ compare: '<' | '>' | '==', args, slack? }` (`==` within `slack`, default 1e-6), `{ logic: 'and' | 'or' | 'not', args }`, and `{ if, then, else }` (only the chosen branch runs).
  - Lists call a user function by name: `{ list: 'generate', fn, count, initial?, data? }` calls `fn(index, previous, count, data)` (`previous` is `initial`, or `null`, at index 0; at most 10 000 items); `{ list: 'map' | 'filter' | 'sort', fn, items, data? }` calls `fn(item, index, data)` (`filter` wants a boolean, `sort` a number key, ascending and stable). `{ list: 'slice', items, start, end? }`, `{ list: 'length', items }` and `{ list: 'at', items, index }` (negative from the end) take no function. A function may declare fewer params than it gets. `data` is how a callback reads an input or a cell while staying pure; it packs under the callback's param type, so that type must be packable (a number, a vec2 value or a list of them; not an object shape yet).
  - Random, seeded and stateless (the same seed and index always give the same value): `{ random: 'white', seed, index }`, `{ random: 'jittered', seed, index, count }` (one value per slot of `count`) and `{ random: 'smooth', seed, t, scale? }` (value noise, continuous in `t`). All are in `[0, 1)`.
  - In code they print as calls on `lib` (`import * as lib from '@dirty-geometry/fn/lib'`): `lib.max(a, b)`, `lib.smallerThan(a, b)`, `lib.ifElse(c, a, b)`, `lib.map(points, onCircle, data)`, `lib.white(seed, i)`. The printed code runs, and the playground reads it back. `lib` is a reserved name.
- **Types** (`schema/typing.ts`): `checkDefinition` gives every input and cell its type and lists the problems (names, scope, unknown operations, missing or misfitting arguments) with their path. Numbers are one family: every number type fits every other, and the type of a slot only decides how a literal there is packed. A literal's type is itself (`0.1` fits `AnglePrecisions`), and a result that may be `null` fits the non-null slot.
- **Evaluation** (`recording/evaluate.ts`) runs the cells in order on real values. A failing cell keeps its error, the cells using it fail with "depends on …", and the others still run; given the previous run, unchanged cells are reused.
- **Recording** (`recording/recorder.ts`) still writes version 3 (the calls in recording order, `recording/v3.ts`), and `fromV3` (`recording/migrate.ts`) turns that into cells: a node used once is written into its user, every other node becomes a cell. `rec.lib` wraps the classes in Proxies, so a constructor records `Vec2.new` and a member call or field read `Class.member`; callbacks, generators, `toJson` / `serialise` (`schema/policy.ts`) and results that are not vec2 values run unrecorded with a warning, or throw with `createRecorder({ strict: true })`. Numbers returned by operations come back as `Scalar`s that remember their node; arithmetic on them gives plain literals, and loops and branches run once while recording. `replay.ts` (`evaluateDefinition`) runs version 3 definitions directly.
- **Schema.** The schema is only needed for packing and for the playground's editors. `bun run schema` extracts it with the compiler API into the committed `schema/vec2.schema.json` (version 2), `schema/vec2.dense.json` and `schema/bindings.ts` (the class and helper tables). `numbers` lists the semantic number types of `core/numbers.ts` (`Coordinate`, `Length`, `Radians`, `Parameter`, `Integer`, `Index`, `Tolerance`) with the ranges they can be packed with; a range name is its own definition (`±100@0.01`, `0..255`). `Coordinate` (always signed, `±1` … `±10000`) and `Length` (never negative, `0..1` … `0..10000`) each cross five spans with the precisions 1, 0.1, 0.01, 0.001 and 0.0001 (25 ranges, the first the default), and a refinement (`Index`: `{ "extends": "Integer", "min": 0 }`) clamps its parent's ranges. `types` holds named shapes, including each class's JSON type (`Line2Json`: `{ "from": "Vec2Json", "to": "Vec2Json" }`, without the `type` tag, which its name implies) and `MathJson`, the union of them all. `modules` nests the folders, with classes and helpers directly in their folder (no file level; a name used twice in a folder fails generation); a class has `new` and `members` (`static: true`, a read `value`, `null` when it cannot be recorded, and `toJson` returning its JSON type). Static values (constants) and private members (`private`, `protected`, `#x`, `_x`) are not listed, and a name may not be both a static and an instance member. Types are compact: a name, `[T]`, `{ enum }`, `{ or }`, `{ tuple }`, `{ record }`, or an object written as its fields; a parameter is its type unless flagged `{ type, optional }` / `{ type, rest }`. Parameters and JSON fields may not use a bare `number`: `bun run schema` fails until it has a semantic type. `schema/schema.ts` reads the schema into `operations` (id, schema path, owner, parameters and result type) and `classJson`; `bindings.ts` also re-exports the classes, helpers and number types by name, with `value(json)`, for printed code. `bun run schema:check` and a test fail when the files are stale.
- **Operations are class members or helpers.** In `operations/`, public operations are static methods (`ConstrainedDelaunay.triangulate`); a loose exported function must live in a `helpers/` folder, or `bun run schema` fails.
- **Packing** (`schema/dense/definition.ts`, `vec2.dense.json` from `scripts/vec2-dense-schema.ts`). Expressions are packed by type: each type has a union of what may stand where a value of it is expected — a name (`input`, `cell`, `param`, as an index), a function call, an item or field, a stored value, the shared forms that fit (math and random for numbers, comparisons and logic for booleans, `generate` / `map` / `filter` / `sort` / `slice` for lists, `if` and `at` everywhere), the literal shapes the type allows, and every operation whose result fits (keyed by operation id, `Vec2.add`). Each variant is an object template (densing 0.5), so the unions share them: an operation's arguments are written once, as a template named after its signature (`(self: Vec2, other: Vec2)`). A cell is packed under its own type (`Any`, keyed by type name), so only well-typed expressions pack, and an operation costs only the bits of the operations that fit where it stands. Numbers snap onto the active range of their number type; `numberLiterals` lists them by type, for choosing ranges. The schema is used as generated, without densing's `schemaFromJson`; tests check that `schemaFromJson` accepts it. A payload starts with a stamp of the schema, so one packed against another schema is refused. The plate packs to 231 characters (its version 3 recording, with 16 evaluated rim points, took 385).
- **Version 3 links** decode with a frozen copy of their schema and operation ids (`schema/dense/v3/`), which never reads the live schema, then go through `fromV3`.
- **Inspection.** `/lab/vec2/playground/` edits definitions as cells, as nodes (Grasshopper style, functions as clusters) or as code; `/lab/vec2/definitions/` shows the recorded plate (`examples/definitions/plate.ts`) and its graph.

## Tests

`bun test` here, or `bun run test` from the repo root. Wall-clock budgets run with `bun run test:perf`; operation-count budgets run in the default suite. Review findings and the fixes for them are in [docs/REVIEW.md](../../docs/REVIEW.md).
