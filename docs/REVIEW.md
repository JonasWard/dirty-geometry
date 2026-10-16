# Library review: vec2, graph, visualisation

These three packages were moved from `wall-graph`:

| Package | Came from |
| --- | --- |
| `packages/vec2` (`@dirty-geometry/vec2`) | `src/math`, `src/examples` |
| `packages/graph` (`@dirty-geometry/graph`) | `src/wall-graph/graph` |
| `packages/visualisation` (`@dirty-geometry/visualisation`) | `src/visualisation` (math demos only) |

This review covers each package's structure, checks its logic, and lists architecture problems.

Each finding has a status:

- **Confirmed (run):** reproduced by running code against the moved packages.
- **Confirmed (traced):** followed through the code by hand, not executed.
- **Suspected:** plausible from reading the code, but not proven.

Paths are relative to `packages/<name>/`. The move left line numbers in vec2 and graph unchanged.

## Scores

The first column is the score at review time; the second is after the fix pass described in [Status after the fix pass](#status-after-the-fix-pass).

| Package | At review | After fixes | One-line verdict after fixes |
| --- | --- | --- | --- |
| vec2 | 6 / 10 | **8 / 10** | Layer order is enforced by a test and only one 3-file cycle is left. Values are immutable, dispatch uses type tags, JSON goes through a codec registry, and CDT uses exact predicates. Still open: mixed fill rules, the cost of rectangle decomposition, clustering drift, and grid defaults sized for buildings. |
| graph | 7 / 10 | **8.5 / 10** | Rotations and the subgraph helpers are correct, and payloads use an injectable codec, so the core imports only `Vec2`. Winding is still assumed rather than checked. |
| visualisation | 6.5 / 10 | **8 / 10** | Scenario data now lives in vec2, dispatch is table-driven and checked at compile time, the registry is lazy, and GPU buffers are disposed. Demos still repeat the frame border and label block, and the V8 workaround stays. |

The original scores and findings below are kept as they were written; line numbers refer to the code at review time.

---

## Status after the fix pass

All fixes are on branch `claude/exciting-rubin-79zitx`, one commit per step. Every bug fix comes with a regression test that fails without it.

- `bun run test`: 666 pass, 16 skipped perf tests, 0 fail.
- `bun run test:perf`: 682 pass. `TriMesh2.containsPoint` now meets its 100 ms budget (it was 204 ms).
- Typecheck and the static `next build` are clean.
- In a browser pass over all 11 `/lab` tabs, every tab renders with no console errors.

### Guardrails

| What | Commit |
| --- | --- |
| `scripts/import-graph.ts` plus architecture tests: no new import cycles, vec2 layer order (`epsilon/hash/analysis → core/interval2 → aabb2/spatial → geometry → grid → operations → io`), `src` never imports `examples`. The allowlists can only shrink. | f1eec0b |
| Visualisation: `geometry/` never imports `demos/`, and `meta.ts` never reaches React or three.js. Graph: the core imports only `Vec2` from vec2. | 6ba1adf, cfee970, a144f9c |

### vec2

| Finding | Fixed in |
| --- | --- |
| M1 right angle, M9 angle equality (precision is now degrees everywhere), M10 `wrapToTau`, M11 angle hash wrap | 0b5e5b6 |
| M2 `Frame2.transform`, M3 direction transforms (`Vec2.transformDirection`) | 18d4bbd |
| M5 neighbour hashes wrap; dedup searches `ceil(slack / grid)` rings | a12b82b |
| M6 empty-interval semantics | a867846 |
| M7 `evaluateAtLength` past a zero-length segment | d6f0b83 |
| M8 `isAngleJson`, M21 lossless JSON (±Infinity as strings, `Grid2` frame and epsilon) | 8d66990 |
| M12 `constraintRegion`, M13 axes whose domain excludes 0 | c4b3368 |
| M14 rays, M15 Hesse2 and half-planes in Overlap2 | e385f1b |
| M16 rays in half-planes, M17 tri-mesh guests in Contains2 | 64392f6 |
| M18 pinch vertices ranked by angle | 077f544 |
| M19 closed Douglas–Peucker | 1af683a |
| M20 length-based intersection tolerances (`Epsilon.parameter`) | 1a0a17b |
| M22 `console.warn` removed | 99c3be5 |
| Boolean2 clip winding: a CW clip loop is a hole of the smallest CCW clip that contains it | 761e08f |
| **New:** an `Aabb2` lying entirely inside a `Polygon2` reported no overlap | e385f1b |
| **New:** Contains2 always returned `false` for a `Hesse2` guest (surfaced by the exhaustive switch) | 9ab98ec |
| Suspected CDT robustness: exact `orient`/`inCircle` (`robust-predicates`); `Circle2.inCircle` and `Frame2.toLocal` drop absolute thresholds | 39c4f44 |
| Suspected CDT cost and silent failures: a new adjacency-mesh core (`operations/cdt/`), walking point location, Sloan constraint flips, hashed point registry, `constrainedDelaunayReport` with `unresolved` and operation counts. 2000 random points: 647 → 50 ms. | 47c005d |
| Suspected `TriMesh2.containsPoint` cost: allocation-free `Polygon2.distanceToPoint`, cached segments | c1066cb |
| Suspected stack overflow from spreading arrays: confirmed (CDT on 600k points threw). `Aabb2.fromPointList`; `Interval2.union` and `Aabb2.union` loop. | 32e7658, 99c3be5 |

Architecture:

| Problem | Fixed in |
| --- | --- |
| Import cycles: epsilon → analysis, angle ↔ vec2, the 8-file primitives / aabb2 / polygon2 / line2-like cycle, tri-mesh2 → operations, the 7-file grid cycle. Left: `grid/regions/{grid-line2, grid-polygon2, grid-rectangle2}`, which convert into each other. | a3059c6, 2d8b3a6, 46020e7, 79256f5, b25d6c1 |
| 1. `instanceof` dispatch → `switch (g.type)` with `assertNever`, plus guards in `geometry/kinds.ts` | 9ab98ec |
| 2. Shared mutable statics → readonly fields, frozen constants, `Interval2.including()` | 99c3be5 |
| 3. Absolute tolerances → exact predicates in CDT, `Epsilon.parameter(length)` for parameter tolerances | 39c4f44, 1a0a17b, 47c005d |
| 4. Closed `Deserialise` → `CodecRegistry` (`io/codec.ts`, `io/codecs/*`, `io/default-registry.ts`) | 8d66990 |
| 6. `NGonMesh` moved to graph | fce25f0 |

Untested at review, now covered: `hash/neighbors`, every `transform()` (M2/M3), `isRightAngle`, `constraintRegion`, axes whose domain excludes 0, JSON round-trips of every registered type. Also new: CDT tests for a 50×50 collinear lattice, the exact Delaunay property, invariance under power-of-two scale and a 2²⁰ offset, hull coverage, and operation-count budgets that run in the default suite.

Dead code: `Angle.getDomainInDegrees` was removed. The two unreachable branches went with the rewrites of Overlap2 (e385f1b) and CDT (47c005d).

### graph

| Finding | Fixed in |
| --- | --- |
| G1, G2 rotations (now `HalfEdge \| null`; `rotateAroundOriginCw` added), `iterateVertex`, G10 degenerate loops and `hash2` keys | c9faa8d |
| G3, G4 (plus `twoCore()`), G5 (`maxExpansions`), G6 (`heuristic` option), G7, G8, G9, G11; duplicate re-exports; cached frozen `nodes`/`edges` | 5ac8230 |
| Architecture 1: payload validation → `EdgeDataCodec`. The default `jsonEdgeData()`; geometry payloads are opt-in through `undirected-graph/geometry-edge-data`. | a144f9c |
| Architecture 2: half-edge links are private (`HalfEdge.link`); `halfEdgesFrom` is indexed | c9faa8d |

### visualisation

| Finding | Fixed in |
| --- | --- |
| V-A1 inverted layering: scenario data and `evaluate*` live in `vec2/examples/<demo>/scenarios.ts`, frame fitting in `demos/<demo>/frame.ts`. The 4 tests are back in vec2. | 6ba1adf |
| Repeated `instanceof` chains → `display/dispatch.ts` tables checked with `satisfies`; V5 is fixed with them | 603bc9f |
| Eager registry → `demos/*/meta.ts`, the `@dirty-geometry/visualisation/meta` export, and `React.lazy` components | cfee970 |
| V1 dispose, V2 memoise, V3 keys, V4 zoom, V6 clipping, V7 seeded RNG | 98245bc |

### API changes

wall-graph keeps its own copy of the old code, so these only affect code that uses the packages here.

| Old | New |
| --- | --- |
| `Epsilon.clusterSortedValues(values)` | `clusterSortedValues(values, epsilon)` from `analysis/clustering/center` |
| `Aabb2.polygon2()` | `Polygon2.fromAabb2(box)`, or `box.corners()` |
| `Line2/Ray2/InfiniteLine2.intersect(o)` | `intersectionLines(a, o)` |
| `InfiniteLine2/Ray2.definitionLine()` | `Line2.definitionOf(line)` |
| `InfiniteLine2.hesseNormal()` | `Hesse2.fromInfiniteLine(line)` |
| `Interval2.include(v)` (mutating) | `interval.including(v)` (returns a new interval) |
| Writable `Vec2.x/y`, `Interval2.min/max`, `Frame2`, `TriMesh2.vertices/triangles` | `readonly`; `TriMesh2.withoutCleanup` keeps a frozen copy |
| `Angle.equals` precision in radians | degrees, compared around the circle |
| `Interval2.clampedInteger(domain, range, epsilon)` | `Interval2.clampedInteger(domain, range)` |
| `Deserialise.Hesse2` | `Deserialise.hesse2` |
| Interval JSON wrote ±Infinity as `null` | `"Infinity"` / `"-Infinity"` (`null` is still read) |
| `Circle2.inCircle`: cocircular points counted as inside within 1e-12 | exact; cocircular counts as outside |
| Boolean2 clips: every polygon is solid | CW clip loops are holes of the CCW clip that contains them |
| `HalfEdge.rotateAround*` returned the edge itself at a boundary | `null`; links are read-only |
| `peelSpurs` peeled trees to nothing | keeps the longest path; `twoCore()` has the old effect |
| `UndirectedGraph2D` validated geometry payloads by default | `{ codec }` option, default plain JSON; `geometryEdgeData()` opt-in |
| `addEdge(a, b)` with `data` omitted for any `T` | `data` is required unless `{}` is assignable to `T` |
| `NGonMesh` from vec2 `geometry/regions/ngon-mesh` | from `@dirty-geometry/graph` |
| `VisualisationShell`, `GEOMETRY_KIND` | removed; kinds are vec2 type tags |

### Added after the fix pass

- **Recorded definitions** (`packages/vec2/src/recording/`). Calls through `createRecorder().lib` are recorded into a JSON DAG with named params and outputs. They replay with new params (`evaluateDefinition`), and the DAG can be inspected (`definitionGraph`).
  - It relies on the immutability work in Phase 2: every method is pure, so replaying the calls rebuilds the same values.
  - The class files are untouched. Operations are resolved through a schema generated from the source (`packages/vec2/schema/`) and kept current by `bun run schema:check`.
  - Commits: 0511356 (schema), 9e5f3cc (recorder), 807811c (replay), f47ad42 (graph and demo).

### Still open

- **V8:** the drei `<Html>` / React canary issue. It is worked around in the lab viewer, not fixed upstream.
- **Mixed fill rules:** `Polygon2.containsPoint` uses non-zero winding, while `isPointInside` and `signedDistanceFromLoops` use even-odd.
- **`polygon-analysis/rectangle-decomposition.ts`** is still exponential in the worst case.
- **`analysis/clustering`:** running-mean drift and the stale k-means centroid.
- **Architecture 5:** the grid and polygon-analysis defaults are sized for buildings. `Axis.limits` stays ±2²⁵ and is documented.
- **Graph architecture 3:** face winding is assumed, not validated.
- **Graph helpers:** `bridgeOpenPath` defaults are still tuned for wall cycles.
- **Untested:** `polygon-analysis/grid-polygon-path`. `segment-sweep` is only exercised through CDT.
- **Dead code:** `Line2.parametricOffsetInterval` and `Axis.withDomain` are still unused.
- **One import cycle** remains in `grid/regions` (allowlisted).

---

## What changed during the move

Behaviour was kept as-is wherever possible. The only changes were the ones needed to type-check and build under Next.js. Bun never type-checked the old repo, so each of these was hiding a problem.

| Change | Why |
| --- | --- |
| `visualisation/src/geometry/display/shared/circle.ts`: added the missing `Vec2` import | Type error that blocks the build. |
| `visualisation/src/demos/grid2/Grid2RectangleDetectionVisualisation.tsx`: `world.min` → `world.min()`, `world.max` → `world.max()` | **Runtime bug.** It pushed function references into the frame-fit points, which made the fit NaN. The Grid2 rectangle-detection demo drew **nothing** in wall-graph; it renders now. |
| `visualisation/src/geometry/display/shared/line-like.ts` and `geometry/frame/geometryFrame.ts`: `Hesse2` now goes through `infiniteLine()` | `Hesse2` was added to `LineLike2` / `Geometry2`, but these consumers were never updated. A `Hesse2` crashed `geometryFramePoints` (`.vertices` of undefined) and produced a NaN line. |
| `visualisation/src/demos/contains2/scenarios.ts`: imports `Container2` / `Geometry2` | Type names were renamed in `contains2.ts`, and the demo still imported the old names. |
| `vec2/test/operations/intersectionLines2.test.ts`: narrows away `Hesse2` | The same `LineLike2` drift, this time in a test helper. |
| `'use client'` on the canvas and demo components; registry reduced to the 11 math demos; `src/index.ts` barrel added | Required for the Next.js app router. The wall demos stay in wall-graph. |
| Wall-clock perf budgets (`tri-mesh2.perf`, `dedup-vertices.perf`) gated behind `PERF=1` | `TriMesh2.containsPoint` misses its 100 ms budget in wall-graph too (181 ms measured). Run them with `bun run test:perf`. |
| 4 tests moved from vec2 to `visualisation/test` (`boolean2`, `contains2`, `grid-geometries`, `tri-mesh2.perf`) | They import demo `scenarios.ts`, which imports the view layer. See V-A1. |

Results after the move: `bun run test` reports 535 pass, 16 skip (perf), 0 fail. `bun run typecheck` is clean.

---

## 1. vec2 (`@dirty-geometry/vec2`)

### Structure: 6/10

What works:

- The layers are readable: `core → bounds → geometry → operations → grid / io / analysis`.
- Naming is consistent. Every type ends in `…2`, and each has a `static readonly type`, a `toJson()` method and an `XJson` type.
- Constructors clone their inputs, and most regions expose `readonly` fields.
- `Epsilon` is the single tolerance object, with `preferIn`/`preferOut` semantics used almost everywhere.

What costs points:

- **No public entry point.** There is no barrel, so every file path is public API. The package `exports` map (`./*`) makes that explicit for now.
- **Import cycles that run against the layer order:**
  - `core/epsilon.ts:1` → `analysis/clustering/center`. The lowest layer depends on the highest.
  - `core/vec2 ↔ core/angle`, and `core/angle → bounds/interval2`.
  - `bounds/aabb2.ts:4 → geometry/regions/polygon2 → aabb2`.
  - `geometry/primitives/{line2,ray2,infinite-line2}` ↔ `operations/intersection/line2-like`.
  - `geometry/kinds.ts:4` imports `Hesse2` as a value; it should be `import type`.
  - `geometry/regions/tri-mesh2.ts:5` → `operations/spatial/dedup-vertices`.
- **Inconsistent immutability:**
  - `Vec2.x/y`, `Interval2.min/max`, `Frame2` fields and `TriMesh2.vertices/triangles` are public and writable.
  - `Interval2.include()` mutates in place.
  - Shared statics are returned by reference, e.g. `Line2.parameterInterval = Interval2.unit`. Calling `line.interval().include(2)` would change `Interval2.unit` for the whole process.
- **Mixed tolerance units:**
  - Area-like quantities (orientation, the in-circle determinant) are compared against `Epsilon.sq`.
  - Distances are compared against `Epsilon.value`.
  - Neither scales with the input. `Frame2.toLocal` hard-codes `1e-12`.
  - `Angle` precision means degrees when hashing but radians in `equals`.
- **Closed serialisation.** `io/deserialise.ts` imports every class, so deserialisation can't be tree-shaken or extended.

### Confirmed bugs

| # | Status | Location | Input | Actual | Expected |
| --- | --- | --- | --- | --- | --- |
| M1 | run | `core/angle.ts:74-76` `isRightAngle` | `Angle.fromDegrees(135)` / `(270)` | `true` / `false` | 270° is the right angle. The code compares against `ThreePiOver4` (135°). wall-graph's `feature-outline.ts:778` works around this. |
| M2 | run | `core/frame2.ts:22-26` `Frame2.transform` | `new Frame2(V(10,0)).transform(Mat3.identity()).xAxis` | `(-9, 0)` | `(1, 0)`. The axes are transformed as points and then the new origin is subtracted. This breaks `Grid2.transform` (`grid/core/grid2.ts:163`). |
| M3 | run | `geometry/primitives/infinite-line2.ts:62-64`, `ray2.ts:56-58`, and `Hesse2.transform` through them | `InfiniteLine2(V(0,0), V(0,1)).transform(Mat3.translation(10,0)).direction` | `(10, 1)` | `(0, 1)`. Direction vectors are translated. `test/geometry/primitives/hesse-normal2.test.ts:65-73` compares two outputs that share this bug, so it cannot catch it. |
| M5 | run | `hash/neighbors.ts:10` vs `hash2scale` | `dedupVertices([V(-1e-7,0.05), V(1e-7,0.05)], Epsilon.custom(1e-3))` | 2 vertices | 1. Neighbour cell hashes skip the modulo wrap that cell hashes apply, so lookups across x = 0 / y = 0 miss. This affects TriMesh2 cleanup and CDT. |
| M6 | run | `bounds/interval2.ts:272-284` `mergeMin/mergeMax` | `Interval2.union([0,1], Interval2.empty())` | `[-∞, ∞]` | `[0, 1]`. Also, `Interval2.empty().width()` is `∞` and `isInfinite()` is `true`. |
| M7 | run | `geometry/primitives/line2.ts:102` `evaluateAtLength` | `Polyline2([V(0,0),V(1,0),V(1,0)]).evaluateAtLength(1)` | `(NaN, NaN)` | `(1, 0)`. Division by a zero-length last segment. |
| M8 | run | `io/deserialise.ts:359-364` `isAngleJson` | `{type:'Angle', domainKind:'pi'}` | accepted; `Angle.value` is `undefined` | Rejected. This is an `&&`/`\|\|` precedence bug. |
| M9 | traced | `core/angle.ts:70-72` `Angle.equals` | default precision | ±0.1 rad (5.7°) tolerance; 359.99° ≠ 0° | Precision should mean degrees, as in the hash, and equality should wrap around 2π. |
| M10 | traced | `core/angle.ts:128-131` `wrapToTau(-1e-17)` | | `2π` | A value in `[0, 2π)`. |
| M11 | traced | `core/angle.ts:162-163` `getAngleHash` | | Clamps instead of wrapping, so 359.9° and 0° fall in different buckets. | Wrap. |
| M12 | traced | `grid/core/grid2.ts:156-160` `constraintRegion` | any constrained grid | Returns `null` when constrained, and on a default grid builds the region from `null` domains, which throws. | The condition is inverted. |
| M13 | traced | `grid/core/grid-axis.ts:139-153` `Axis.edge(i)` | domain `[5,10]` | Throws "Axis index out of domain", because it sums `size(0…i-1)`. | Domains that exclude 0 should work. The loop is also O(i) even on uniform axes. |
| M14 | traced | `operations/overlap2.ts:369-434` | `Ray2((0,0),(1,0))` vs `Polyline2([(5,-1),(5,1),(6,1)])` | `false` | `true`. Rays are cut to their defining segment. |
| M15 | traced | `operations/overlap2.ts` `overlapPair` | `Hesse2` vs a crossing `Line2` | `false` | `true`. `Hesse2` isn't dispatched. Half-plane vs `Aabb2` is always `false`, and half-plane vs `Circle2` uses line distance (`Math.abs`, `:224`). |
| M16 | traced | `operations/contains2.ts:161` `rayIn` with `preferOut` | Ray parallel to, and inside, a half-plane | `false` | `true`. The slope is not divided by the ray length either. |
| M17 | traced | `operations/contains2.ts:192-219` `triMeshIn` | Comb-shaped container; a triangle spanning the teeth | TriMesh guest: `true` | `false`. Only vertices and edge midpoints are sampled. The same triangle as a `Polygon2` correctly gives `false`. |
| M18 | traced | `geometry/regions/tri-mesh2.ts:274-281` `nextBoundaryVertex` | Pinch vertices | Picks by raw cross product, so a long gentle turn beats a short sharp one. | Pick by angle. |
| M19 | traced | `operations/douglas-peucker.ts:74` | Closed loop starting mid-edge | `v[0]`/`v[n-1]` are always kept, so a collinear start vertex survives. | Simplify across the closing edge. |
| M20 | traced | `operations/intersection/line2-like.ts:24,51-57` | `Line2` of length 1e7 vs a collinear `InfiniteLine2` | A point is returned instead of the overlap. | Tolerances are in parameter space, so they shrink or grow with segment length. |
| M21 | traced | JSON round-trip | `Aabb2.infinite()`, `Interval2.empty()` | `JSON.stringify` turns `Infinity` into `null`, so parsing throws. `Grid2.toJson` drops `frame`/`epsilon`. | Lossless round-trip. |
| M22 | traced | `bounds/interval2.ts:41` | | `console.warn` in library code | No side effects. |

M4 is withdrawn. `Vec2.hash(scale)` wrapping is not a bug: the hash quantises coordinates to `scale` and packs 2²⁶ buckets per axis, so it distinguishes points over a range of 2²⁶ · `scale` (about 67 units at the default 1e-6). Set `scale` to the coordinate precision of the data being hashed. It would help to say this in the doc comment on `Vec2.hash` and `hash2scale`.

`Mat3` element order was checked and is consistent: row-major constructor, column-major storage, and `Vec2.transform`, `multiply` and `Frame2.toMat3` all agree. There is no `inverse()` or `determinant()`.

**Convention mismatch in Boolean2** (`operations/boolean2.ts:121,133`): clip polygons are each tested as filled regions with `every`/`some`. A clockwise "hole" loop passed in the clip list therefore counts as solid. Reproduced: subject (4..6)², clip `[outer 0..10, CW hole 3..7]`. `intersect` keeps the subject and `subtract` removes it. `union`, by contrast, treats CW loops as holes. Either document that clips are independent solids, or honour winding.

### Suspected

- **CDT robustness** (`operations/constrained-delaunay.ts`):
  - There are no exact predicates.
  - `Circle2.inCircle` compares a determinant in length⁴ units against an absolute `1e-12` (`circle2.ts:118`). That is meaningless at km scale and over-sensitive at mm scale.
  - The super-triangle is finite (`:345-350`).
  - `enforce`/`legalize` give up silently (`:381`, `:391`).
- **CDT cost:**
  - `insert` scans every triangle, so it is O(n²).
  - `legalize` rebuilds edge counts on every flip, roughly O(T³) in the worst case.
  - The point registry is O(n²).
- **`TriMesh2.containsPoint`** goes through `Polygon2.isPointInside`, which recomputes segments on every query. This is the likely cause of the perf budget miss.
- **Stack overflow on large inputs** from spreading arrays into calls: `Math.min(...arr)`, `Aabb2.fromPoints(...vertices)`, `Interval2.union(...)`.
- **Mixed fill rules:** `Polygon2.containsPoint` uses non-zero winding, while `isPointInside` and `signedDistanceFromLoops` use even-odd.
- **`polygon-analysis/rectangle-decomposition.ts`** enumerates candidates in O(W³H³), then runs an exhaustive branch-and-bound.
- **`analysis/clustering`:** the running mean `(rep + v) / 2` drifts, and k-means re-seeding counts a stale centroid.

### Architecture problems

1. **Classes plus `instanceof` dispatch** in Contains2, Overlap2, CDT and Boolean2 break as soon as two copies of the package are installed. They also rule out plain JSON-shaped inputs. Prefer dispatching on the existing `static type` tag.
2. **Shared mutable statics** (`Interval2.unit`, `Angle.tauDomain`, the `parameterInterval`s): return copies, or freeze them.
3. **Absolute tolerances:** introduce a scale-aware tolerance, at least for the CDT and intersection predicates.
4. **Closed `Deserialise` switch:** use a codec registry keyed by `type`, so modules can be tree-shaken and new types can register themselves.
5. **Grid and polygon-analysis** carry building-specific defaults (`Axis.limits` ±2²⁵, metre-scale Douglas–Peucker). They could be split into a separate `vec2-grid` package.
6. **Misplaced code:** `geometry/regions/ngon-mesh.ts` is a plain data holder used only by `graph`'s half-edge factory and by wall-graph, so it belongs in `graph`.

### Untested

- `hash/core`, `hash/neighbors`
- `operations/intersection/segment-sweep`
- `polygon-analysis/grid-polygon-path`
- every `transform()` method (the only existing test is the circular one noted in M3)
- `Angle.isRightAngle`
- `Grid2.constraintRegion`
- `Axis` with a domain that excludes 0
- JSON round-trips with infinite bounds

### Dead code

These are exported but never used outside their own file:

- `Angle.getDomainInDegrees`
- `Line2.parametricOffsetInterval`
- `Axis.withDomain`

Unreachable branches:

- the `a >= n` throw in `remapConstraints` (CDT `:297`)
- the `InfiniteLine2` branch of `overlapsCircle` (`overlap2.ts:177`), which the half-plane branch shadows

`Deserialise.Hesse2` is the only capitalised method on `Deserialise`.

---

## 2. graph (`@dirty-geometry/graph`)

### Structure: 7/10

What works:

- Small files with a clean split between `he-graph/` (half-edge structure built from `NGonMesh`) and `undirected-graph/` (an id-keyed 2D graph with BFS, Dijkstra, A* and via-point paths).
- Generic payloads.
- No wall-domain logic.

What costs points:

- It lived under `wall-graph/` even though it is generic.
- `undirected-graph-2d.ts:26-27` re-exports the path-search API, so the same names are exported twice.
- `edge-subgraph.ts` holds helpers tuned for wall outer cycles (`bridgeOpenPath` with `maxBridgeLength = 24`, `peelSpurs`, `pathBetweenLeaves`).
- Much of the API (`bfs`, `aStar`, `via`, JSON round-trip) is only exercised by tests.

### Confirmed bugs

| # | Status | Location | Issue |
| --- | --- | --- | --- |
| G1 | run | `he-graph/half-edge.ts:29-31` `rotateAroundOrigin` | Returns `twin.prev`, which ends at the origin rather than starting there. On two triangles sharing edge 1→2, it returns a half-edge whose origin is **3**, not 1. It should return `prev.twin`. `HalfEdgeGraph.iterateVertex` (`half-edge-graph.ts:53-64`) builds on this, so it is also wrong. At boundary vertices it also stops at the first edge without a twin instead of sweeping back the other way. |
| G2 | traced | `he-graph/half-edge.ts:34-36` `rotateAroundDestination` | The doc says "incoming", but `next.twin.next` is outgoing from the destination. |
| G3 | run | `undirected-graph/edge-subgraph.ts:21-27` `isSimpleCycleEdgeSet` | Two disjoint triangles return `true`: it only checks that every degree is 2, not connectivity. wall-graph's `wall-outer-cycle.ts` relies on it. |
| G4 | run | `undirected-graph/edge-subgraph.ts:40-60` `peelSpurs` | A Y shape peels down to the **empty set**. The "has a degree > 2 node" guard is checked once, then leaves are peeled until none remain. |
| G5 | traced | `undirected-graph/path-search.ts:81-102` `searchLongestSimplePath` | Deduplicates edges, not nodes, so it returns trails rather than simple paths. It is exponential and has no cap when used from `pathBetweenLeaves(…, longest=true)`. |
| G6 | traced | `undirected-graph/path-search.ts:129-131, 257` A* | The Euclidean heuristic is admissible only when edge cost ≥ length. Custom `interpret` costs (hop counts, weights) can give non-optimal paths. |
| G7 | traced | `undirected-graph/undirected-graph-2d.ts:236, 302-303` `path` with `via` | A blocked "forced" via-edge silently falls back to `searchPath`. With `search: 'bfs'`, direct segments are costed in length units while searched segments are costed in hops, and the two are added together. |
| G8 | traced | `undirected-graph/undirected-graph-2d.ts:108-111` `addEdge` | Accepts a foreign node instance as long as its id exists, which corrupts adjacency. It should check `nodesById.get(id) === node`. |
| G9 | traced | `undirected-graph/undirected-graph-2d.ts:106,115` | `data?: T` falls back to `{}` cast to `T`, a type hole. `edge.data` is publicly writable after validation. |
| G10 | traced | `he-graph/factory.ts:46-57` | Degenerate loops are accepted: `[0,1,1,2]` creates a zero-length half-edge, and pinched loops are not rejected. Edge keys use `hash2(a,b)`, which is exact only for indices below 2²⁶, and that bound isn't checked. |
| G11 | traced | `undirected-graph/path-search.ts:210` | BFS uses `queue.shift()`, which is O(n²). |

Checked and fine:

- Twin pairing and the misoriented-edge check in `factory.ts`.
- Dijkstra's lazy deletion.
- `removeNode`/`removeEdge` leave no dangling adjacency.

### Architecture problems

1. **Payload validation in the core:** `undirected-graph/edge-data.ts:1-11` imports nine vec2 geometry classes plus `Deserialise`, which pulls most of vec2 into a generic graph. It also rejects payloads that are neither JSON nor `Geometry2` at runtime. Make validation and serialisation an injectable codec.
2. **Mutable internals:** half-edge `next`/`prev`/`twin` are publicly writable. The `nodes`/`edges` getters allocate a new array on every access, and `halfEdgesFrom` is O(E).
3. **Winding is assumed, not checked:** the half-edge "CCW" claims assume CCW faces, but neither `NGonMesh` nor the factory validates winding.

---

## 3. visualisation (`@dirty-geometry/visualisation`)

### Structure: 6.5/10

What works:

- Every demo follows the same `scenarios.ts` (data + evaluate) / `*Visualisation.tsx` (meta + cell) pattern.
- Layout is shared through `ScenarioGridVisualisation` / `scenarioGrid.ts`.
- `geometry/display` is a pure geometry-to-display-data layer.

What costs points:

- **V-A1, inverted layering:**
  - Scenario data imports the view layer: `demos/{aabb2,boolean2,contains2,overlap2}/scenarios.ts` import `frameAnchorPoints` from `geometry/`.
  - `geometry/components/GridGeometryRender.tsx:22` imports `demos/grid2/colors`.
  - Math tests depended on demo scenarios as a result, which is why four tests now live in this package.
  - Fix: move scenario data into `vec2/examples` and keep only frame fitting here.
- **Repeated `instanceof` dispatch.** Adding a geometry kind means editing six chains:
  - `display/types.ts geometryKindOf`
  - `display/outline/index.ts`
  - `display/interior/index.ts`
  - `frame/geometryFrame.ts`
  - graph's `edge-data.ts isGeometry2`
  - `Overlap2Visualisation`'s private `isContainer2`

  `OUTLINE_CREATORS` / `FILL_CREATORS` are exported but not used for dispatch. The `Hesse2` drift fixed during the move is exactly this failure mode.
- **Eager registry.** `core/registry.tsx` imports every demo eagerly, and each demo's meta lives in the same module as its component. Metadata can't be read without loading three.js.
- **Duplication:**
  - `Boolean2Visualisation` re-implements `ContainerInteriorMesh`.
  - Several scenario files define their own kind-name helpers.
  - Every demo repeats the frame border and the `<Html>` label block.

### Logic and resource issues

| # | Status | Location | Issue |
| --- | --- | --- | --- |
| V1 | traced | `geometry/components/ContainerInteriorMesh.tsx:23`, `demos/boolean2/Boolean2Visualisation.tsx:65` | `useMemo` geometry attached via `<primitive>` is never disposed, so the GPU buffer leaks on every memo change or unmount. Add `useEffect(() => () => g.dispose(), [g])`. |
| V2 | traced | `geometry/components/GeometryRender.tsx:46`, `CurveVisualisation`, `ConstrainedDelaunayVisualisation`, `Aabb2`/`Overlap2`/`Interval2`/`IntersectionLines2` | Nothing is memoised: outlines, CDTs and curve queries are recomputed on every render. Every resize re-renders the whole tree through `VisualisationCanvasHost`'s render prop. |
| V3 | run | `core/scenarioGrid.ts:44` | The React key is `scenario.name`, and names are duplicated: boolean2 has "Overlapping squares" and "Disjoint squares" twice, curves has "Tolerance near-miss" twice. React warns in dev. |
| V4 | traced | `core/ScenarioGridVisualisation.tsx:44` | `minZoom={20}` is hard-coded, while the fitted zoom is often lower on tall grids. The first scroll snaps the view to 20 and you can't zoom back out. Resizing also resets the user's zoom. |
| V5 | traced | `geometry/display/types.ts` `geometryKindOf` | Unknown kinds silently fall back to `TriMesh2`. |
| V6 | traced | `core/frame.ts:18-29` | The doc says "content square", but the code clips to the full frame. A zero-length direction yields ±∞ points. |
| V7 | traced | `vec2/examples/intersection-lines/randomLineLike2.ts` | `Math.random()` scenarios are built at module load, so they can't be reproduced. Use a seeded RNG. |
| V8 | run | drei `<Html>` with Next 16's bundled React canary | Unmounting a demo while mounting the next one in the same commit throws `removeChild … not a child of this node` and drops a label. This doesn't happen with plain React 19.2. It is worked around in `components/lab/lab-viewer.tsx`, which mounts the next demo one frame later. |

### Migration notes

- **React 19 is required.** R3F 9 and drei 10 need it, so the site moved from React 18 to 19. The code uses no React-19-only APIs.
- **Tailwind:** everything the visualisers use exists in Tailwind 3.4, and the `content` globs include `packages/visualisation/src`. `backdrop-blur-sm` is 4 px in v3 versus 8 px in v4.
- **SSR:** there is no module-scope `window` or `document` access. The lab page loads the canvas with `next/dynamic({ ssr: false })`.

---

## Prioritised follow-ups

1. **Core math correctness, with tests:**
   - M2/M3: transforms
   - M5: neighbour lookup in the spatial hash (silently affects dedup and CDT)
   - M1: right angle
   - M6: empty interval merge
   - M8: angle JSON precedence
   - M12/M13: grid
2. **Graph correctness:** G1 (half-edge rotation), G3/G4 (cycle check, spur peeling), G7 (forced via).
3. **Visualisation resources:** V1 (dispose geometry), V2 (memoise), V3 (unique keys).
4. **Architecture:**
   - break the epsilon → analysis and aabb2 ↔ polygon2 cycles
   - dispatch on the `type` tag instead of `instanceof`
   - an injectable codec for graph payloads and `Deserialise`
   - move scenario data out of the view layer
5. **Robustness:** scale-aware tolerances and exact orientation and in-circle predicates for CDT; drop the O(n²) passes.
6. **Tests:** cover the untested modules listed above. Replace wall-clock budgets with operation counts, or keep them opt-in.
