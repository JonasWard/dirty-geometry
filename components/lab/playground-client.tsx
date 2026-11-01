"use client";

import type { PlaygroundAbout } from "@dirty-geometry/visualisation/playground";
import dynamic from "next/dynamic";

// The playground reads the URL hash and draws with three.js, so it only renders in the browser.
const Playground = dynamic(() => import("@dirty-geometry/visualisation/playground").then((module) => module.Playground), {
  ssr: false,
  loading: () => <div className="h-[60vh] min-h-[420px] w-full border border-dg-border bg-[#0b0d12]" />,
});

/** The playground, with its help (shown above it, or in the View tab's drawer on phones). */
export default function PlaygroundClient({ about }: { about: PlaygroundAbout }) {
  return <Playground about={about} />;
}
