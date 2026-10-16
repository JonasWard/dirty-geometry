"use client";

import { findDemo } from "@dirty-geometry/visualisation/meta";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** The lab used to pick demos by hash (`/lab#/curves`); send those links to the demo's own page. */
export default function LegacyHashRedirect({ labPath }: { labPath: string }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.location.hash.replace(/^#\/?/, "").replace(/\/+$/, "").replace("/", "-");
    if (!id) return;
    const demo = findDemo("vec2", id) ?? findDemo("graph", id);
    if (demo) router.replace(`${labPath}${demo.library}/${demo.id}/`);
  }, [labPath, router]);
  return null;
}
