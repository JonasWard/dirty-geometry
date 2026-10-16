# @dirty-geometry/graph

Graph structures on top of `@dirty-geometry/vec2`. The core imports only `Vec2`.

- **`UndirectedGraph2D<T>`:**
  - id-keyed nodes with positions and typed edge payloads;
  - BFS, Dijkstra and A* (with an optional `heuristic`) and via-point path search;
  - edge-subset helpers: simple cycles, components, `peelSpurs`, `twoCore`, longest paths with an expansion budget.
- **`HalfEdgeGraph`:**
  - a half-edge structure built from an `NGonMesh` with `createFromNGon`;
  - faces are assumed counter-clockwise;
  - `rotateAroundOrigin` / `rotateAroundOriginCw` / `rotateAroundDestination` return `null` at a boundary.

```ts
import { UndirectedGraph2D, createFromNGon } from '@dirty-geometry/graph';
```

## Edge payloads

Payloads are validated and serialised by an `EdgeDataCodec<T>`. The default, `jsonEdgeData()`, accepts plain JSON records. For vec2 geometry payloads, opt in explicitly:

```ts
import { geometryEdgeData } from '@dirty-geometry/graph/undirected-graph/geometry-edge-data';

const graph = new UndirectedGraph2D({ codec: geometryEdgeData() });
```

Review findings and the fixes for them are in [docs/REVIEW.md](../../docs/REVIEW.md).
