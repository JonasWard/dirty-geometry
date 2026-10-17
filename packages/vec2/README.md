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
| 7 | `recording/` | record calls as JSON definitions, replay them (reads the generated `schema/`; nothing else imports it) |

`examples/` holds the scenario data behind the `/lab` demos, plus a seeded RNG (`examples/random`). `src` never imports from it.

## Conventions

- **Values are immutable.** Fields are `readonly`, shared constants are frozen, and methods return new values (`interval.including(v)`).
- **Parameter names:** `other` for a second value of the same type (`v.add(other)`), `a, b` for symmetric pairs (`Overlap2.overlaps(a, b)`), `point` for a query point, `matrix` for a `Mat3`, `factor` for a scale, `radians` for raw angles, `value` for a scalar on an interval, `slack` for an optional `Epsilon` tolerance, `points` for unordered point sets and `vertices` for ordered ones.
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
import { createRecorder, evaluateDefinition } from '@dirty-geometry/vec2/recording/index';

const rec = createRecorder();
const { Vec2, Line2 } = rec.lib; // the vec2 classes, recording every call
const width = rec.param('width', 3); // a named, editable input
const line = new Line2(new Vec2(0, 0), new Vec2(width, 4));
rec.output('end', new Vec2(1, 0).scale(line.length()));

const definition = rec.definition(); // plain JSON: params, a DAG of operation nodes, outputs
const { outputs } = evaluateDefinition(definition, { params: { width: 6 } }); // replay with a new width
```

- **Schema.** TypeScript has no runtime reflection, so `bun run schema` extracts the operations with the compiler API into the committed `schema/vec2.schema.json`, plus `schema/bindings.ts` (the runtime table) and `schema/ids.ts`. The JSON is nested by namespace: `classes.<Name>` holds `module`, `typeTag`, `new` (absent for static-only classes) and `members` (`static: true` on the class itself, `value: true` for fields and constants that are read, not called); `helpers.<module>` holds helper functions. Parameter lists are omitted when empty, and an entry that cannot be recorded has only a `reason`. `schema/operations.ts` flattens it into one entry per id (`Vec2#add`, `Vec2.origin`, `Vec2.new`, `operations/helpers/…:fn`). `bun run schema:check` and a test fail when the files are stale. The only hand-written part is `schema/policy.ts`: excluded classes and members, and aliases for renamed operations so stored definitions keep replaying.
- **Operations are class members or helpers.** In `operations/`, public operations are static methods (`ConstrainedDelaunay.triangulate`); a loose exported function must live in a `helpers/` folder, or `bun run schema` fails.
- **What is recorded.** Calls to vec2 operations: constructors, static and instance methods, static constants, readonly fields and the helper functions in `operations/**/helpers/` (`rec.lib.helpers`). Arguments are stored as literals, references to earlier nodes, or (for vec2 values made outside the recorder) their `toJson()`. Callbacks, generators and policy exclusions run unrecorded with a warning, or throw with `createRecorder({ strict: true })`.
- **Scalars.** Numbers and strings returned by vec2 operations come back as `Scalar` objects that remember their node, so `v.scale(line.length())` is linked in the graph. Arithmetic works through `valueOf()` but gives plain numbers, recorded as literals: `line.length() * 2` does not follow a new param. Because a `Scalar` is an object, use `.value` for `===`, truthiness and `typeof`.
- **Calls, not code.** Loops and branches run once while recording; replay repeats the same calls with the new params but does not re-decide a branch or a loop count.
- **Packing.** `@dirty-geometry/vec2-dense` packs definitions and values into densing strings, and `/lab/vec2/playground/` builds definitions interactively.
- **Replay and inspection.** `evaluateDefinition` checks the schema hash (and that every operation still exists, via aliases) and type-checks param overrides. `definitionGraph` lays the DAG out in layers; `/lab/vec2/definitions/` shows both on the plate example in `examples/definitions/plate.ts`.

## Tests

`bun test` here, or `bun run test` from the repo root. Wall-clock budgets run with `bun run test:perf`; operation-count budgets run in the default suite. Review findings and the fixes for them are in [docs/REVIEW.md](../../docs/REVIEW.md).
