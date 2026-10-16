# @dirty-geometry/vec2

A 2D geometry library. Source-only TypeScript with no barrel: import each module by its path.

```ts
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { constrainedDelaunay } from '@dirty-geometry/vec2/operations/constrained-delaunay';
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
| 5 | `operations/` | Boolean2, Contains2, Overlap2, intersections, Douglas–Peucker, constrained Delaunay (`operations/cdt/`), polygon analysis |
| 6 | `io/` | JSON codecs |

`examples/` holds the scenario data behind the `/lab` demos, plus a seeded RNG (`examples/random`). `src` never imports from it.

## Conventions

- **Values are immutable.** Fields are `readonly`, shared constants are frozen, and methods return new values (`interval.including(v)`).
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

`constrainedDelaunay(points, constraints)` dedups the points, splits crossing constraints and returns a `TriMesh2`. `constrainedDelaunayReport` returns the same mesh plus:

- the constraints it could not insert;
- operation counts (`orient`, `inCircle`, `flips`, `walkSteps`).

The core (`operations/cdt/`) is an adjacency mesh with walking point location, Bowyer–Watson insertion in Morton order, constraint insertion by flips, and exact predicates.

## Tests

`bun test` here, or `bun run test` from the repo root. Wall-clock budgets run with `bun run test:perf`; operation-count budgets run in the default suite. Review findings and the fixes for them are in [docs/REVIEW.md](../../docs/REVIEW.md).
