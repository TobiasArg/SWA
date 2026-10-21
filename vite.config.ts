import react from "@vitejs/plugin-react";
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

export default defineConfig({
  plugins: [react(), productionCspPlugin()],
});
