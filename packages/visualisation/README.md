# @dirty-geometry/visualisation

The react-three-fiber display layer for `@dirty-geometry/vec2` geometry. It has three parts:

- `geometry/`: outlines and fills, dispatched on the vec2 `type` tag through tables that are checked at compile time;
- `core/`: a shared scenario-grid canvas;
- `demos/vec2/`, `demos/graph/`: the interactive demos shown on the site under `/lab/vec2/<demo>/` and `/lab/graph/<demo>/`.

- `playground/`: the `/lab/vec2/playground/` editor (`@dirty-geometry/visualisation/playground`) for vec2 definitions (version 4: inputs, functions and cells of expressions):
  - `model/`: pure edits (`ops.ts`: rename, remove a cell into its uses, change an operation keeping its arguments, chain a method onto a value, function params), and the code view (`print.ts` writes a definition as a TypeScript module that runs against vec2, `parse.ts` reads it back; printing and parsing round-trip);
  - `editor/`: the expression editor, one slot per argument, each with a picker that offers only what fits the slot's type (a name, a literal, an operation or user function, arithmetic; operations in the schema's folders, starred favourites first), and a `.` on each value to chain a method onto it;
  - `nodes/` and `model/graph.ts`, `model/graph-edits.ts`, `model/layout.ts`: the Nodes mode, a Grasshopper-style node editor on React Flow (`@xyflow/react`):
    - every operation, call, shared form, list and stored value is a node; a `{ ref }` is a wire; literals stay on their ports;
    - functions are clusters, opened on a canvas of their own; a selection can be made a cluster (incoming wires become params) and a cluster dissolved back;
    - the definition stays the only truth: the graph is derived from it (`toDefinition` is its exact inverse, tested on every starter and random definitions), and every node edit is a definition edit, one undo step each;
    - node keys come from where an expression sits (`c:<cell>@<path>`, `f:<function>@<path>`, `f:<function>#<param>`), so positions need no ids in the definition;
    - wiring follows the migration's rule: a node feeding a second port becomes a cell, and a node the viewer added that ends up feeding one port goes back inside it;
    - wires are checked while dragging (types must fit, no loops); double-click the canvas, or drag a wire from an input into space, to search for a node;
  - `store.ts`: the state (zustand), with undo/redo, automatic number ranges and the densing URL (`#/<app>` for the editor, `#/<app>/<view>` for the View tab, either followed by `/<layout>` for the node positions, all in `url.ts`; the editor with positions is `#/<app>//<layout>`);
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
