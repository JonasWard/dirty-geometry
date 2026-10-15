# dirty-geometry

Some thoughts on how to describe geometry in different ways

(.)

## Packages

The site is a Bun workspace. The geometry code lives in `packages/` and is moved here from `wall-graph`:

| Package | What |
| --- | --- |
| [`@dirty-geometry/vec2`](../packages/vec2) | 2D math library |
| [`@dirty-geometry/graph`](../packages/graph) | undirected and half-edge graphs |
| [`@dirty-geometry/visualisation`](../packages/visualisation) | react-three-fiber demos, shown on `/lab` |

```bash
bun install
bun run test        # package tests (perf budgets: bun run test:perf)
bun run typecheck   # packages + site
bun run dev
```

The structure, logic and architecture review of the packages is in [REVIEW.md](./REVIEW.md).
