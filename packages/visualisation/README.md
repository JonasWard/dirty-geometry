# @dirty-geometry/visualisation

The react-three-fiber display layer for `@dirty-geometry/vec2` geometry. It has three parts:

- `geometry/`: outlines and fills, dispatched on the vec2 `type` tag through tables that are checked at compile time;
- `core/`: a shared scenario-grid canvas;
- `demos/`: the interactive math demos shown on the site's `/lab` page.

The scenario data for the demos lives in `@dirty-geometry/vec2/examples`. This package only fits frames and draws them.

Peer dependencies: `react@19`, `three`, `@react-three/fiber@9`, `@react-three/drei@10`. The components only run on the client. In Next.js, load them with `next/dynamic({ ssr: false })`.

```ts
// Components: each demo is React.lazy, so render it inside <Suspense>.
import { visualisationViews, VisualisationLegend } from '@dirty-geometry/visualisation';
// Metadata only (ids, titles, legends), without React or three.js.
import { visualisationMetas } from '@dirty-geometry/visualisation/meta';
```

Review findings and the fixes for them are in [docs/REVIEW.md](../../docs/REVIEW.md).
