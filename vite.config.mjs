import { defineConfig } from "vite";
import { createProjectConfig, normalizeTargetName } from "./vite.shared.mjs";

export default defineConfig(() => {
  const requested = normalizeTargetName(process.env.STX_TARGET) ?? "MemoryOS";
  return createProjectConfig(requested, {
    watch: process.argv.includes("--watch"),
  });
});
