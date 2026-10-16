# dirty-geometry

Some thoughts on how to describe geometry in different ways

(.)

## Packages

The site is a Bun workspace. The geometry code lives in `packages/` and is moved here from `wall-graph`:

| Package | What |
| --- | --- |
| [`@dirty-geometry/vec2`](../packages/vec2) | 2D math library |
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
| `/lab/vec2/<demo>/`, `/lab/graph/<demo>/` | One demo, e.g. `/lab/vec2/curves/`, `/lab/graph/path-search/`, `/lab/vec2/definitions/` (recorded definitions) |

Localized copies live under `/de/`, `/fr/` and `/it/`. Old `/lab#/<demo>` links redirect to the demo's page. Scenario data comes from `@dirty-geometry/vec2/examples` and `@dirty-geometry/graph/examples`.

## Deploy

The site is a static export (`bun run build` writes `out/`, one `<route>/index.html` per page).

**Render.** `render.yaml` is a Blueprint for a free static site:

1. In the Render dashboard, choose **New → Blueprint** and pick this repository.
2. Render builds `main` with a pinned Bun from npm, publishes `out/` and redeploys on every push.

The site is served at the root: the Blueprint sets `NEXT_PUBLIC_BASE_PATH=/`, which overrides the GitHub Pages base path in `.env.production`. Sitemap and robots.txt use Render's `RENDER_EXTERNAL_URL`; for a custom domain, add `SITE_URL` (e.g. `https://geometry.example.com`) to the service's environment.

**GitHub Pages.** `.github/workflows/deploy-github-pages.yml` builds with `NEXT_PUBLIC_BASE_PATH=/dirty-geometry` on every push to `main`.

To preview the Render build locally: `NEXT_PUBLIC_BASE_PATH=/ bun run build`, then serve `out/` with any static server, e.g. `python3 -m http.server -d out`. A plain `bun run build` uses `.env.production`, i.e. the GitHub Pages base path.

The structure, logic and architecture review of the packages is in [REVIEW.md](./REVIEW.md).
