"use client";

import { useEffect, useState } from "react";
import { VisualisationLegend, visualisationViews } from "@dirty-geometry/visualisation";

const views = visualisationViews;
const DEFAULT_VIEW_ID = views[0]!.meta.id;

function viewIdFromHash(hash: string): string {
  const raw = (hash.replace(/^#\/?/, "").trim().split(/[?#]/)[0] ?? "").replace(/\/+$/, "");
  if (!raw) return DEFAULT_VIEW_ID;
  return views.some((view) => view.meta.id === raw) ? raw : DEFAULT_VIEW_ID;
}

function hashForViewId(id: string): string {
  return `#/${id}`;
}

export default function LabViewer() {
  const [activeId, setActiveId] = useState(() => viewIdFromHash(window.location.hash));
  const active = views.find((view) => view.meta.id === activeId) ?? views[0]!;

  useEffect(() => {
    const onHashChange = () => setActiveId(viewIdFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Mount the next demo one frame after the previous one unmounted. drei's <Html> unmounts its
  // label roots synchronously; with the React build Next ships, doing that in the same commit
  // that mounts the next demo's labels throws a removeChild error and drops a label.
  const [mountedId, setMountedId] = useState<string | null>(null);
  useEffect(() => {
    setMountedId(null);
    const frame = requestAnimationFrame(() => setMountedId(active.meta.id));
    return () => cancelAnimationFrame(frame);
  }, [active.meta.id]);
  const mounted = views.find((view) => view.meta.id === mountedId);

  return (
    <section className="space-y-6">
      <nav className="flex flex-wrap gap-2" aria-label="Demos">
        {views.map((view) => {
          const selected = view.meta.id === active.meta.id;
          return (
            <a
              key={view.meta.id}
              href={hashForViewId(view.meta.id)}
              aria-current={selected ? "page" : undefined}
              className={`border px-3 py-1.5 text-xs tracking-widest uppercase font-medium transition-colors duration-200 ${
                selected
                  ? "border-dg-navy-900 bg-dg-navy-900 text-dg-sky-200"
                  : "border-dg-border text-dg-subtle hover:border-dg-steel-600 hover:text-dg-steel-600"
              }`}
            >
              {view.meta.label}
            </a>
          );
        })}
      </nav>

      <div>
        <h2 className="text-2xl font-bold mb-2">{active.meta.title}</h2>
        <p className="text-dg-muted leading-relaxed max-w-4xl">{active.meta.description}</p>
      </div>

      <div className="relative h-[75vh] min-h-[480px] w-full overflow-hidden border border-dg-border bg-[#0b0d12]">
        {mounted?.render()}
        <VisualisationLegend items={active.meta.legend} />
      </div>
    </section>
  );
}
