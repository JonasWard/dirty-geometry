# @dirty-geometry/visualisation

react-three-fiber display layer for `@dirty-geometry/vec2` geometry (`geometry/`), a shared scenario-grid canvas (`core/`), and the interactive math demos (`demos/`) shown on the site's `/lab` page.

Peer dependencies: `react@19`, `three`, `@react-three/fiber@9`, `@react-three/drei@10`. The components are client-only; load them with `next/dynamic({ ssr: false })` in Next.js.

```ts
import { visualisationViews, VisualisationLegend } from '@dirty-geometry/visualisation';
```

Known issues are listed in [docs/REVIEW.md](../../docs/REVIEW.md).
