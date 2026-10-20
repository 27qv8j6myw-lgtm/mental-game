import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** 빌드마다 바뀌는 버전. 배포된 앱이 새 버전이 나왔는지 알아내는 데 쓴다 (src/update.ts) */
const APP_VERSION = new Date().toISOString();

/** 빌드 결과물에 version.json 을 함께 만든다 */
function versionFile(): Plugin {
  return {
    name: "version-file",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ version: APP_VERSION }),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), versionFile()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
});
