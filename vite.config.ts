import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const ocrProxyTarget = env.VITE_OCR_PARSE_PROXY_TARGET || "https://us-central1-monthly-balance-548d1.cloudfunctions.net";

  return {
    plugins: [react()],
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
