import type { Plugin } from "vite";
import type { OutputBundle, OutputChunk } from "rollup";

/**
 * Starts downloading the map while the app itself downloads.
 *
 * Reported on 28 November 2026: the map loads very slowly. The map page
 * fetched its code in a chain: the app (about 206 KB compressed), and only
 * once that had run and drawn the workspace, the map view and the map
 * library (about 218 KB more). On a phone that wait was spent doing
 * nothing. These tags let the browser fetch the map code at the same time
 * as the app, so the chain becomes one step.
 *
 * Tagged data-map-preload so the prerendered pages can drop them where no
 * map is shown (see renderRoute in vite-plugin-prerender.ts): "library"
 * for the map library, which the city pages also draw with, "workspace"
 * for the map view only the main app uses.
 */
export default function mapPreloadPlugin(): Plugin {
  return {
    name: "map-preload",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const bundle = ctx.bundle as OutputBundle | undefined;
        if (!bundle) return;
        const chunks = Object.values(bundle).filter((c): c is OutputChunk => c.type === "chunk");
        const mapView = chunks.find((c) => c.facadeModuleId?.replace(/\\/g, "/").endsWith("/src/features/map/MapView.tsx"));
        if (!mapView) return;
        const isLibrary = (file: string) => /maplibre/i.test(file);
        const files = [mapView.fileName, ...mapView.imports.filter((f) => !(bundle[f] as OutputChunk | undefined)?.isEntry)];
        const css = [...((mapView as OutputChunk & { viteMetadata?: { importedCss?: Set<string> } }).viteMetadata?.importedCss ?? [])];
        for (const f of mapView.imports) {
          const chunk = bundle[f] as (OutputChunk & { viteMetadata?: { importedCss?: Set<string> } }) | undefined;
          if (chunk && !chunk.isEntry) css.push(...(chunk.viteMetadata?.importedCss ?? []));
        }
        return [
          ...files.map((file) => ({
            tag: "link",
            attrs: { rel: "modulepreload", href: `/${file}`, "data-map-preload": isLibrary(file) ? "library" : "workspace" },
            injectTo: "head" as const,
          })),
          ...[...new Set(css)].map((file) => ({
            tag: "link",
            attrs: { rel: "preload", as: "style", href: `/${file}`, "data-map-preload": isLibrary(file) ? "library" : "workspace" },
            injectTo: "head" as const,
          })),
        ];
      },
    },
  };
}
