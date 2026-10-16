# @dirty-geometry/visualisation

The react-three-fiber display layer for `@dirty-geometry/vec2` geometry. It has three parts:

- `geometry/`: outlines and fills, dispatched on the vec2 `type` tag through tables that are checked at compile time;
- `core/`: a shared scenario-grid canvas;
- `demos/vec2/`, `demos/graph/`: the interactive demos shown on the site under `/lab/vec2/<demo>/` and `/lab/graph/<demo>/`.

- `playground/`: the `/lab/vec2/playground/` builder (`@dirty-geometry/visualisation/playground`), with a DOM builder, JSON mode, TypeScript editing, a canvas of every intermediate geometry and densing URL state.

The scenario data for the demos lives in `@dirty-geometry/vec2/examples` and `@dirty-geometry/graph/examples`. This package only fits frames and draws them.

Peer dependencies: `react@19`, `three`, `@react-three/fiber@9`, `@react-three/drei@10`. The components only run on the client. In Next.js, load them with `next/dynamic({ ssr: false })`.

```ts
// One demo with its legend; its code loads on first view.
import { DemoViewer } from '@dirty-geometry/visualisation';
<DemoViewer library='graph' id='path-search' />;

// Metadata only (libraries, ids, titles, legends), without React or three.js.
import { demoLibraries, demosFor, findDemo } from '@dirty-geometry/visualisation/meta';
```

Review findings and the fixes for them are in [docs/REVIEW.md](../../docs/REVIEW.md).
