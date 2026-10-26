import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { configDefaults, defineConfig } from "vitest/config";

/**
 * 브라우저 OCR 엔진 파일을 같은 출처의 /ocr/에서 서빙한다(ADR-021). 받는 쪽 경로는 src/lib/utils/ocrSession.ts와 맞춘다.
 * 파일마다 target을 따로 둔다. 플러그인은 target의 일치 파일이 0개면 빌드를 실패시키므로 하나라도 빠지면 빌드에서 드러난다.
 * 코어는 LSTM 전용 3종만 둔다. 라이브러리가 기기 지원(relaxed SIMD → SIMD → 기본)에 따라 하나를 고른다.
 */
const OCR_ASSETS = [
  { src: "node_modules/tesseract.js/dist/worker.min.js", dest: "ocr" },
  {
    src: "node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js",
    dest: "ocr/core",
  },
  { src: "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", dest: "ocr/core" },
  { src: "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", dest: "ocr/core" },
  {
    src: "node_modules/@tesseract.js-data/kor/4.0.0_best_int/kor.traineddata.gz",
    dest: "ocr/lang",
  },
];

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: OCR_ASSETS.map((asset) => ({ ...asset, rename: { stripBase: true } })),
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // /api는 wrangler dev(pnpm dev:api, 8788)의 Worker가 맡는다.
  server: {
    proxy: { "/api": "http://localhost:8788" },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "app",
          // 기본 환경은 node. 화면 테스트 파일만 첫 줄에 `// @vitest-environment jsdom`을 적는다(ADR-008).
          setupFiles: ["./src/test/setup.ts"],
          // 서버 D1 테스트는 workerd에서 돈다(vitest.d1.config.ts, 스펙 interior-planner 태스크 0-3).
          exclude: [...configDefaults.exclude, "**/*.d1.test.ts"],
        },
      },
      "./vitest.d1.config.ts",
    ],
  },
});
