# @dirty-geometry/vec2

2D geometry library: vectors, angles, frames and matrices (`core/`), intervals and boxes (`bounds/`), lines, polylines, polygons, circles and triangle meshes (`geometry/`), booleans, containment, overlap, constrained Delaunay and Douglas–Peucker (`operations/`), grids (`grid/`), JSON (`io/`) and clustering (`analysis/`).

Source-only TypeScript; import by path:

```ts
import { Vec2 } from '@dirty-geometry/vec2/core/vec2';
import { triangulateSources } from '@dirty-geometry/vec2/operations/constrained-delaunay';
```

`examples/` holds reusable fixture geometry (`@dirty-geometry/vec2/examples/...`).

Run tests with `bun test` here, or `bun run test` from the repo root. Known issues are listed in [docs/REVIEW.md](../../docs/REVIEW.md).
