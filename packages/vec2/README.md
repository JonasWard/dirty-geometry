# @dirty-geometry/vec2

A 2D geometry library. Source-only TypeScript with no barrel: import each module by its path.

```ts
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { ConstrainedDelaunay } from '@dirty-geometry/vec2/operations/constrained-delaunay';
```

## Layout

Folders are layered. A module may only import from its own layer or a lower one, and `test/architecture` enforces this along with a no-new-cycles rule.

| Layer | Folders | What |
| --- | --- | --- |
| 0 | `core/epsilon`, `hash/`, `analysis/` | tolerances, spatial hashing, clustering |
| 1 | `core/`, `bounds/interval2` | `Vec2`, `Angle`, `Mat3`, `Frame2`, exact predicates, intervals |
| 2 | `bounds/aabb2`, `spatial/` | boxes, vertex dedup |
| 3 | `geometry/` | primitives (`Line2`, `Ray2`, `InfiniteLine2`, `Hesse2`), curves, regions (`Polygon2`, `Circle2`, `TriMesh2`), type tags and guards in `geometry/kinds` |
| 4 | `grid/` | `Grid2`, axes, cells and grid regions |
| 5 | `operations/` | static-only classes: `Boolean2`, `Contains2`, `Overlap2`, `Intersection2`, `DouglasPeucker`, `ConstrainedDelaunay`, `RectilinearGrid2`; their plumbing (CDT core, constraint edges, grid paths) in `operations/helpers/` |
| 6 | `io/` | JSON codecs |
| 7 | `recording/` | record calls as JSON definitions by reflection, replay them (reads only the generated `schema/bindings.ts`; nothing else imports it) |

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

## Constrained Delaunay

`ConstrainedDelaunay.triangulate(points, constraints)` dedups the points, splits crossing constraints and returns a `TriMesh2`. `ConstrainedDelaunay.report` returns the same mesh plus:

- the constraints it could not insert;
- operation counts (`orient`, `inCircle`, `flips`, `walkSteps`).

The core (`operations/helpers/cdt/`) is an adjacency mesh with walking point location, Bowyer–Watson insertion in Morton order, constraint insertion by flips, and exact predicates.

## Recording definitions

`recording/` stores *how* a value was made, not just the value, without touching any class.

```ts
import { createRecorder } from '@dirty-geometry/vec2/recording/recorder';
import { evaluateDefinition } from '@dirty-geometry/vec2/recording/replay';

const rec = createRecorder();
const { Vec2, Line2 } = rec.lib; // the vec2 classes, recording every call
const width = rec.param('width', 3); // a named, editable input
const line = new Line2(new Vec2(0, 0), new Vec2(width, 4));
rec.output('end', new Vec2(1, 0).scale(line.length()));

const definition = rec.definition(); // plain JSON (version 2): params, the calls in order, outputs
const { outputs } = evaluateDefinition(definition, { params: { width: 6 } }); // replay with a new width
```

- **Recording by reflection.** `rec.lib` wraps the classes in Proxies, so a constructor records `Vec2.new`, any member call or field read records `Class.member` (static when the node has no `self`), a helper records `helpers.name`, and taking an element or field of a result records `result.item` / `result.field`. Nothing is precomputed: callbacks, generators, `toJson` / `serialise` (`schema/policy.ts`) and results that are not vec2 values run unrecorded with a warning, or throw with `createRecorder({ strict: true })`. Arguments are stored as bare literals, `{ ref }` to earlier nodes, `{ param }`, `{ object }`, or (for vec2 values made outside the recorder) `{ value: toJson() }`.
- **Replay** (`evaluateDefinition`) runs each node by name on the class and helper tables; a call that no longer exists fails with a clear error, definitions older than version 3 ask to be re-recorded, and param overrides must have the recorded type (`number`, `string`, `boolean` or a class name). With `partial: true` it returns the values computed before the first failure.
- **Schema.** The schema is only needed for packing and for the playground's editors. `bun run schema` extracts it with the compiler API into the committed `schema/vec2.schema.json` (version 2), `schema/vec2.dense.json` and `schema/bindings.ts` (the class and helper tables). `numbers` lists the semantic number types of `core/numbers.ts` (`Coordinate`, `Length`, `Radians`, `Parameter`, `Integer`, `Index`, `Tolerance`) with the ranges they can be packed with; a range name is its own definition (`±100@0.01`, `0..255`), and a refinement (`Length`: `{ "extends": "Coordinate", "min": 0 }`) clamps its parent's ranges. `types` holds named shapes, including each class's JSON type (`Line2Json`: `{ "from": "Vec2Json", "to": "Vec2Json" }`, without the `type` tag, which its name implies) and `MathJson`, the union of them all. `modules` nests the folders down to classes; a class has `new` and `members` (`static: true`, a read `value`, `null` when it cannot be recorded, and `toJson` returning its JSON type; a static that shares an instance member's name sits under that member's `static`). Types are compact: a name, `[T]`, `{ enum }`, `{ or }`, `{ tuple }`, `{ record }`, or an object written as its fields; a parameter is its type unless flagged `{ type, optional }` / `{ type, rest }`. Parameters and JSON fields may not use a bare `number`: `bun run schema` fails until it has a semantic type. `schema/schema.ts` reads the schema into `operations` (with their schema path) and `classJson`. `bun run schema:check` and a test fail when the files are stale.
- **Operations are class members or helpers.** In `operations/`, public operations are static methods (`ConstrainedDelaunay.triangulate`); a loose exported function must live in a `helpers/` folder, or `bun run schema` fails.
- **Scalars.** Numbers and strings returned by vec2 operations come back as `Scalar` objects that remember their node, so `v.scale(line.length())` is linked in the graph. Arithmetic works through `valueOf()` but gives plain numbers, recorded as literals: `line.length() * 2` does not follow a new param. Because a `Scalar` is an object, use `.value` for `===`, truthiness and `typeof`.
- **Calls, not code.** Loops and branches run once while recording; replay repeats the same calls with the new params but does not re-decide a branch or a loop count.
- **Packing.** `vec2.dense.json` is the same schema as a plain densing schema (generated by `scripts/vec2-dense-schema.ts`, loaded with densing's `schemaFromJson`): each number type is a numeric definition, JSON types are templates (`MathJson` a union keyed by `type`, so a value's `toJson()` is its data; nested JSON types are packed without their tag and get it back when decoding), each parameter type is an `Arg<T>` union (a node, a param, omitted, a vec2 value, or the literal shapes the type allows), and nodes are nested unions following the schema's folders, files and classes down to the member, with one-entry levels joined (`vec2/Vec2`). `schema/dense/definition.ts` maps the history to and from that data in one walk, snapping numbers onto the chosen range, and calls `densing` / `undensing`.
- **Inspection.** `/lab/vec2/playground/` builds definitions interactively; `/lab/vec2/definitions/` shows the plate example in `examples/definitions/plate.ts` and its graph.

## Tests

`bun test` here, or `bun run test` from the repo root. Wall-clock budgets run with `bun run test:perf`; operation-count budgets run in the default suite. Review findings and the fixes for them are in [docs/REVIEW.md](../../docs/REVIEW.md).
