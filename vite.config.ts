import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const ocrProxyTarget = env.VITE_OCR_PARSE_PROXY_TARGET || "https://us-central1-monthly-balance-548d1.cloudfunctions.net";

  return {
    plugins: [react()],
    define: {
      __APP_BUILD__: JSON.stringify(
        new Date().toISOString().slice(0, 16).replace("T", " ")
      ),
    },
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (id.includes("firebase")) return "vendor_firebase";
              if (id.includes("xlsx")) return "vendor_xlsx";
              if (id.includes("jspdf") || id.includes("html2canvas")) return "vendor_pdf";
              if (id.includes("react-router-dom")) return "vendor_router";
              return "vendor";
            }

            if (id.includes("src/services/recordsService")) {
              return "records_service";
            }
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api/ocr/parse": {
          target: ocrProxyTarget,
          changeOrigin: true,
          timeout: 120000,
          proxyTimeout: 120000,
          rewrite: (path) => path.replace(/^\/api\/ocr\/parse$/, "/ocrParse"),
        },
      },
    },
  };
});
