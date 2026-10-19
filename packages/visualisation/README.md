# @dirty-geometry/visualisation

The react-three-fiber display layer for `@dirty-geometry/vec2` geometry. It has three parts:

- `geometry/`: outlines and fills, dispatched on the vec2 `type` tag through tables that are checked at compile time;
- `core/`: a shared scenario-grid canvas;
- `demos/vec2/`, `demos/graph/`: the interactive demos shown on the site under `/lab/vec2/<demo>/` and `/lab/graph/<demo>/`.

- `playground/`: the `/lab/vec2/playground/` editor (`@dirty-geometry/visualisation/playground`) for vec2 definitions (version 4: inputs, functions and cells of expressions):
  - `model/`: pure edits (`ops.ts`: rename, remove a cell into its uses, change an operation keeping its arguments, chain a method onto a value, function params), and the code view (`print.ts` writes a definition as a TypeScript module that runs against vec2, `parse.ts` reads it back; printing and parsing round-trip);
  - `editor/`: the expression editor, one slot per argument, each with a picker that offers only what fits the slot's type (a name, a literal, an operation or user function, arithmetic; operations in the schema's folders, starred favourites first), and a `.` on each value to chain a method onto it;
  - `store.ts`: the state (zustand), with undo/redo, automatic number ranges and the densing URL (`#/4/<options>/<definition>`; older links are upgraded);
  - a canvas of every input's and cell's geometry, and the encoding panel.

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
