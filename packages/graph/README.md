# @dirty-geometry/graph

Graph structures on top of `@dirty-geometry/vec2`:

- `UndirectedGraph2D`: id-keyed nodes with positions, typed edge payloads, BFS / Dijkstra / A* and via-point path search, plus edge-subset helpers (cycles, components, spur peeling).
- `HalfEdgeGraph`: half-edge structure built from an `NGonMesh` with `createFromNGon`.

```ts
import { UndirectedGraph2D, createFromNGon } from '@dirty-geometry/graph';
```

Known issues (including the half-edge rotation bug) are listed in [docs/REVIEW.md](../../docs/REVIEW.md).
