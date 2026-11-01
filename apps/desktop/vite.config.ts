import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Split rarely-needed heavy libraries into their own chunks so the first paint
 * only pays for the app shell. KaTeX in particular is ~600 kB and is only used
 * when a note or chat message actually contains math.
 */
function manualChunks(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;
  if (id.includes("katex") || id.includes("rehype-katex")) return "katex";
  if (id.includes("pdfjs-dist")) return "pdfjs";
  if (id.includes("docx-preview")) return "docx";
  if (id.includes("force-graph") || id.includes("d3-")) return "graph";
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "esnext",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
});
