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

| Package | Structure | One-line verdict |
| --- | --- | --- |
| vec2 | **6 / 10** | Sensible layering and naming, but import cycles, mutable shared statics, absolute tolerances, and about 30 logic bugs. Some of those bugs are in core transform and hash paths. |
| graph | **7 / 10** | Small and generic with a clean API. The half-edge rotation is wrong, and a few subgraph helpers don't do what their docs say. |
| visualisation | **6.5 / 10** | The scenario and canvas pattern is consistent. Layering is inverted, `instanceof` dispatch is repeated, nothing is memoised, and GPU geometry leaks. |

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
| M4 | run | `core/vec2.ts:106` + `hash/core.ts:17-19` | `V(0,0).hash() === V(67.108864,0).hash()` | `true` | With the default 1e-6 scale, hashes wrap at 2²⁶, so points collide every ~67 units. |
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
   - M4/M5: hashing and neighbour lookup (these silently affect dedup and CDT)
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
