"use client";

import dynamic from "next/dynamic";

// The playground reads the URL hash and draws with three.js, so it only renders in the browser.
const Playground = dynamic(() => import("@dirty-geometry/visualisation/playground").then((module) => module.Playground), {
  ssr: false,
  loading: () => <div className="h-[60vh] min-h-[420px] w-full border border-dg-border bg-[#0b0d12]" />,
});

const Viewer = dynamic(() => import("@dirty-geometry/visualisation/playground").then((module) => module.Viewer), {
  ssr: false,
  loading: () => <div className="h-[70vh] min-h-[420px] w-full border border-dg-border bg-[#0b0d12]" />,
});

/** The editor; its "open viewer" link goes to the viewer below it (relative, so a base path is kept). */
export default function PlaygroundClient() {
  return <Playground viewerHref="viewer/" />;
}

/** The viewer of a playground link; "edit in the playground" goes back up one level. */
export function ViewerClient() {
  return <Viewer playgroundHref="../" />;
}
