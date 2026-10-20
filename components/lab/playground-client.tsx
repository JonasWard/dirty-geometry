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

/**
 * The editor. `viewerHref` is the viewer's full path (base path included): a relative link would depend on the
 * page's URL ending in "/", which a static host need not keep.
 */
export default function PlaygroundClient({ viewerHref }: { viewerHref: string }) {
  return <Playground viewerHref={viewerHref} />;
}

/** The viewer of a playground link; `playgroundHref` is the playground's full path (base path included). */
export function ViewerClient({ playgroundHref }: { playgroundHref: string }) {
  return <Viewer playgroundHref={playgroundHref} />;
}
