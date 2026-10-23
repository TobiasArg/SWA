import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const productionContentSecurityPolicy =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

function productionCspPlugin(): Plugin {
  return {
    name: "swarm-architecturer-production-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        /<head(\s[^>]*)?>/i,
        (head) =>
          `${head}\n    <meta http-equiv="Content-Security-Policy" content="${productionContentSecurityPolicy}" />`,
      );
    },
  };
}

/** Attach Rolldown's actual module IDs to each emitted JS manifest entry for bundle auditing. */
function manifestModuleIdsPlugin(): Plugin {
  let manifestPath: string | undefined;
  let rootPrefix = "";
  const moduleIdsByFile = new Map<string, string[]>();

  return {
    name: "swarm-architecturer-manifest-module-ids",
    apply: "build",
    configResolved(config) {
      rootPrefix = `${config.root.replaceAll("\\", "/").replace(/\/$/, "")}/`;
      if (!config.build.manifest) return;
      const manifestName = config.build.manifest === true ? ".vite/manifest.json" : config.build.manifest;
      manifestPath = resolve(config.root, config.build.outDir, manifestName);
    },
    buildStart() {
      moduleIdsByFile.clear();
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === "chunk") {
          moduleIdsByFile.set(
            output.fileName,
            output.moduleIds
              .map((id) => {
                const normalized = id.replaceAll("\\", "/");
                return normalized.startsWith(rootPrefix) ? normalized.slice(rootPrefix.length) : normalized;
              })
              .sort(),
          );
        }
      }
    },
    writeBundle: {
      order: "post",
      handler() {
        if (!manifestPath) return;

        let manifest: Record<string, { file?: string; moduleIds?: string[] }>;
        try {
          manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        } catch (error) {
          this.error(`Could not read the Vite manifest to add module IDs: ${String(error)}`);
        }

        let annotated = 0;
        for (const [key, entry] of Object.entries(manifest)) {
          if (!/\.[cm]?js$/i.test(entry.file ?? "")) continue;
          const moduleIds = moduleIdsByFile.get(entry.file!);
          if (!moduleIds) this.error(`Manifest entry ${key} has no corresponding Rolldown output chunk.`);
          entry.moduleIds = moduleIds;
          annotated += 1;
        }
        if (annotated === 0) this.error("The Vite manifest contains no JavaScript chunks to annotate.");

        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      },
    },
  };
}

export default defineConfig({
  appType: "mpa",
  plugins: [react(), productionCspPlugin(), manifestModuleIdsPlugin()],
  build: {
    manifest: true,
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        app: fileURLToPath(new URL("./app/index.html", import.meta.url)),
      },
      output: {
        codeSplitting: {
          groups: [
            { name: "react-vendor", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: "flow-vendor", test: /node_modules[\\/](@xyflow|d3-[^\\/]+|zustand|classcat)[\\/]/ },
            {
              name: "markdown-vendor",
              test: /node_modules[\\/](react-markdown|remark-[^\\/]+|micromark[^\\/]*|mdast-[^\\/]+|unified|hast-[^\\/]+)[\\/]/,
            },
          ],
        },
      },
    },
  },
});
