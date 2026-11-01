# dirty-geometry

Some thoughts on how to describe geometry in different ways

(.)

## Packages

The site is a Bun workspace. The geometry code lives in `packages/` and is moved here from `wall-graph`:

| Package | What |
| --- | --- |
| [`@dirty-geometry/vec2`](../packages/vec2) | 2D math library; recording, its schema and dense packing |
| [`@dirty-geometry/graph`](../packages/graph) | undirected and half-edge graphs |
| [`@dirty-geometry/visualisation`](../packages/visualisation) | react-three-fiber demos, shown under `/lab` |

```bash
bun install
bun run test        # package tests (perf budgets: bun run test:perf)
bun run typecheck   # packages + site
bun run dev
```

## Lab routes

| Route | What |
| --- | --- |
| `/lab/` | Hub: every demo of both libraries |
| `/lab/vec2/`, `/lab/graph/` | One library's demos |
| `/lab/vec2/playground/` | Build a vec2 definition as cells of expressions (edited in place, as code or as JSON) with your own functions; the state is in the URL hash: `#/<app>` (the definition as a densing string, after its custom number ranges and a `.` when it has any), or `#/<app>/<view>` for the View tab, where only the input values change (the view state holds them) |
| `/lab/vec2/<demo>/`, `/lab/graph/<demo>/` | One demo, e.g. `/lab/vec2/curves/`, `/lab/graph/path-search/`, `/lab/vec2/definitions/` (recorded definitions) |

Localized copies live under `/de/`, `/fr/` and `/it/`. Old `/lab#/<demo>` links redirect to the demo's page. Scenario data comes from `@dirty-geometry/vec2/examples` and `@dirty-geometry/graph/examples`.

## Deploy

The site is a static export (`bun run build` writes `out/`, one `<route>/index.html` per page).

**Render.** `render.yaml` is a Blueprint for a free static site:

1. In the Render dashboard, choose **New → Blueprint** and pick this repository.
2. Render builds `main` with a pinned Bun from npm, publishes `out/` and redeploys on every push.

The site is served at the root (https://dirty-geometry.onrender.com/). Sitemap and robots.txt use Render's `RENDER_EXTERNAL_URL`; for a custom domain, add `SITE_URL` (e.g. `https://geometry.example.com`) to the service's environment. To host under a sub-path instead, build with `NEXT_PUBLIC_BASE_PATH` (e.g. `/dirty-geometry`).

To preview the Render build locally: `bun run build`, then serve `out/` with any static server, e.g. `python3 -m http.server -d out`.

**CI.** `.github/workflows/ci.yml` checks formatting, types, the vec2 schema and the tests, and builds, on every push to `main` and every pull request.

The structure, logic and architecture review of the packages is in [REVIEW.md](./REVIEW.md).
