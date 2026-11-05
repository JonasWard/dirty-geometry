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

## Prompt

The playground's prompt bar turns a sentence ("a gear with 12 teeth", or with *edit current*, "make it 7-pointed") into a definition. The code is in `packages/visualisation/src/playground/ai/`.

- **What the model writes.** The definition as JSON, the JSON tab's format, with explicit op ids and named args. The prompt holds:
  - the format, and every expression form (the shared forms' JSON is generated with `fromCall`, so it can't drift);
  - an API reference built from `vec2.schema.json`, as `Polygon2.fromCircle2 {circle: Circle2, segments: Index} → Polygon2`;
  - for core operations, what each one does. The text is the first sentence of its doc comment, collected by `bun run schema` into `vec2.docs.json`;
  - worked examples (`ai/examples.ts` plus starters) chosen because they build with operations, not vertex by vertex.
- **Built-ins first.** Models tend to compute coordinates with sin and cos. Three things push them toward the library's operations:
  - the request opens with "Operations that fit this request": operations ranked by a table of intents (hole → `Boolean2.subtract`, hexagon → `Polygon2.fromCircle2`, …) and by the request's words in op names and docs, each shown with its doc;
  - the rules include a "use the operations" recipe list;
  - the model writes a `"uses"` list of operations before its cells, a one-line plan that is dropped before checking.
- **How the answer is checked.** The JSON is read leniently: comments and trailing commas are fine, and a syntax error is reported with line and caret. Then it is shape-checked (missing `format`/`version` filled in, untyped outputs typed), and goes through `checkDefinition`, `evaluate`, a drawable output and the link. When a stage fails, its errors go back to the model for a fix, named by place (`cells[3] plate at args.radius`) with hints such as an op's real signature: two fixes in full mode, one in light mode. Only a working definition is committed, so Ctrl+Z undoes it. If every attempt fails, the JSON tab opens on the last one with its error. OpenAI-compatible endpoints are asked for `response_format: json_object`, and asked without it if they refuse.
- **Habits the code accepts.** The Code tab reads some TypeScript that people (and models) write by habit:
  - `const` lines inside helper functions, which are inlined into the return;
  - `as Type` casts, which are ignored;
  - `let` for a cell;
  - `Math.PI`, `Math.sin/cos/…` and `Math.sqrt`, read as numbers and `lib.*` calls;
  - helper parameter types such as `Vec2 | undefined` and `(Length | Coordinate)[]`, simplified to `Vec2` and `Coordinate[]` so the link can pack them.

  Printed code stays in the strict form. Known mistakes (loops, ternaries, `%`, comparisons, unknown methods) get a concrete hint in the repair message.
- **Rate limits.** OVHcloud's anonymous limit is 2 requests a minute per model. The browser keeps under it, and on a 429 it waits (`Retry-After`, or until the model's minute is over) and asks the same model again, at most twice. The bar shows a countdown that Cancel stops. Waiting doesn't count toward the time limit, and the eval waits the same way.
- **Timeout.** Each request (the first answer, or a fix) gives up after 100 s. This is a setting next to the model picker, kept in the browser. Rate-limit waits don't count. The status shows the seconds so far, and it warns in amber near the end (the last quarter of the limit, 5 to 20 s). The eval takes `--timeout <s>`.
- **Light mode.** A ~2k-token reference of the core operations, two fixed examples and at most one fix, for small fast models. Full mode sends the whole ~10k-token reference.
- **Models.** Keyless free endpoints (OVHcloud AI Endpoints, LLM7.io; see [awesome-free-llm-apis](https://github.com/mnfst/awesome-free-llm-apis)) are called straight from the browser. They may log prompts, and the bar says so. Claude Haiku 5.5 runs on the viewer's own Anthropic key, which is kept in localStorage and sent only to api.anthropic.com.
- **CORS.** The site has no server, so an endpoint is only usable if it allows browser calls. Before trusting a provider, open the playground (`bun run dev`), run a prompt, and check the network tab for a blocked request. A provider that fails this check comes out of `PROVIDERS` in `ai/providers.ts`.

**Eval.** `bun run ai:eval` scores every model on 20 cases in `packages/visualisation/test/ai-suite.ts`: 6 easy, 7 medium, 4 hard and 3 edits of starters. A case passes when the code works *and* passes property checks such as area, vertex count, or points on a circle. Every case has a reference solution that passes its own checks (tested). The script writes `docs/AI-EVAL.md`:
- pass@1 and pass after fixes, per tier;
- repairs, p50 latency and cost;
- built-in usage: *built-ins* is the share of answers that used a case's preferred operation (`prefers` in the suite), and *ops share* is vec2 operation nodes against math nodes;
- a verdict per model: *recommended*, *usable* or *hidden*;
- a ship check.

Useful flags:
- `--models anthropic/claude-haiku-5-5 --effort low,medium`: Claude needs `ANTHROPIC_API_KEY` or `ant auth login`. The whole suite costs well under $0.50.
- `--mode light`, `--only square,star` and `--runs 1` narrow a run.
- `--list` prints the model ids an endpoint actually serves.
- `--fixtures` records replies, which the tests then replay offline.
- `--dry` answers with the reference solutions, which checks the script without network.

## Deploy

The site is a static export (`bun run build` writes `out/`, one `<route>/index.html` per page).

**Render.** `render.yaml` is a Blueprint for a free static site:

1. In the Render dashboard, choose **New → Blueprint** and pick this repository.
2. Render builds `main` with a pinned Bun from npm, publishes `out/` and redeploys on every push.

The site is served at the root (https://dirty-geometry.onrender.com/). Sitemap and robots.txt use Render's `RENDER_EXTERNAL_URL`; for a custom domain, add `SITE_URL` (e.g. `https://geometry.example.com`) to the service's environment. To host under a sub-path instead, build with `NEXT_PUBLIC_BASE_PATH` (e.g. `/dirty-geometry`).

To preview the Render build locally: `bun run build`, then serve `out/` with any static server, e.g. `python3 -m http.server -d out`.

**CI.** `.github/workflows/ci.yml` checks formatting, types, the vec2 schema and the tests, and builds, on every push to `main` and every pull request.

The structure, logic and architecture review of the packages is in [REVIEW.md](./REVIEW.md).
