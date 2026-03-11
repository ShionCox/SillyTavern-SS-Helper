import { defineConfig } from "vite";
import path from "path";

// A dummy index to replace the real one that bootstraps the whole extension
const dummyIndexCode = `
export const logger = {
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
  trace: console.trace,
};
`;

export default defineConfig({
  plugins: [
    {
      name: "mock-index",
      enforce: "pre",
      resolveId(source, importer) {
        if (source.endsWith("RollHelper/index") || source === "../../index" || source === "../index" || source.endsWith("RollHelper/index.ts")) {
          return "\0mock-index";
        }
      },
      load(id) {
        if (id === "\0mock-index") {
          return dummyIndexCode;
        }
      },
    },
  ],
});
