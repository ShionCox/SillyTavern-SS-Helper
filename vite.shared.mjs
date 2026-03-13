import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_TARGETS = {
  MemoryOS: {
    entry: "MemoryOS/src/index.ts",
    outDir: "MemoryOS/dist",
    manifest: "MemoryOS/manifest.json",
    format: "es",
  },
  LLMHub: {
    entry: "LLMHub/src/index.ts",
    outDir: "LLMHub/dist",
    manifest: "LLMHub/manifest.json",
    format: "es",
  },
  RollHelper: {
    entry: "RollHelper/index.ts",
    outDir: "RollHelper/dist",
    manifest: "RollHelper/manifest.json",
    format: "es",
  },
};

export function normalizeTargetName(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return Object.keys(PROJECT_TARGETS).find((key) => key.toLowerCase() === normalized) ?? null;
}

export function resolveProjectTargets(requestedTargets = []) {
  if (!Array.isArray(requestedTargets) || requestedTargets.length === 0) {
    return Object.keys(PROJECT_TARGETS);
  }

  const resolved = requestedTargets
    .map((target) => normalizeTargetName(target))
    .filter((target, index, list) => Boolean(target) && list.indexOf(target) === index);

  return resolved;
}

function copyManifestPlugin(targetName) {
  return {
    name: `copy-manifest:${targetName}`,
    closeBundle() {
      const target = PROJECT_TARGETS[targetName];
      if (!target) return;

      const source = path.resolve(ROOT_DIR, target.manifest);
      const destination = path.resolve(ROOT_DIR, target.outDir, "manifest.json");
      if (!fs.existsSync(source)) return;

      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    },
  };
}

function copyStaticAssetsPlugin(targetName) {
  return {
    name: `copy-static-assets:${targetName}`,
    closeBundle() {
      if (targetName !== "RollHelper") return;

      const source = path.resolve(ROOT_DIR, "assets/font/思源宋体.otf");
      const destination = path.resolve(ROOT_DIR, "RollHelper/dist/assets/font/思源宋体.otf");
      if (!fs.existsSync(source)) return;

      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    },
  };
}

function copyRollHelperLogoPlugin(targetName) {
  return {
    name: `copy-rollhelper-logo:${targetName}`,
    closeBundle() {
      if (targetName !== "RollHelper") return;
      const source = path.resolve(ROOT_DIR, "assets/images/ROLL-LOGO.png");
      const destination = path.resolve(ROOT_DIR, "RollHelper/dist/assets/images/ROLL-LOGO.png");
      if (!fs.existsSync(source)) return;
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    },
  };
}

function imageFileLoaderPlugin() {
  const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/;
  return {
    name: "image-file-loader",
    enforce: "pre",
    load(id) {
      const clean = id.split("?")[0];
      if (!IMAGE_RE.test(clean)) return null;
      const basename = path.basename(clean);
      this.emitFile({
        type: "asset",
        fileName: `assets/images/${basename}`,
        source: fs.readFileSync(clean),
      });
      return `export default "./assets/images/${basename.replace(/"/g, '\\"')}";`;
    },
  };
}

export function createProjectConfig(targetName, options = {}) {
  const target = PROJECT_TARGETS[targetName];
  if (!target) {
    throw new Error(`Unknown Vite build target: ${targetName}`);
  }

  const watch = options.watch === true ? {} : null;
  const entry = path.resolve(ROOT_DIR, target.entry);
  const outDir = path.resolve(ROOT_DIR, target.outDir);

  return {
    configFile: false,
    root: ROOT_DIR,
    publicDir: false,
    build: {
      target: "es2022",
      sourcemap: true,
      minify: options.watch ? false : "esbuild",
      cssCodeSplit: false,
      emptyOutDir: false,
      outDir,
      watch: watch ?? undefined,
      assetsInlineLimit: 0,
      lib: {
        entry,
        formats: [target.format],
        fileName: () => "index.js",
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          entryFileNames: "index.js",
          chunkFileNames: "chunks/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
    css: {
      postcss: { plugins: [] },
    },
    plugins: [
      imageFileLoaderPlugin(),
      copyManifestPlugin(targetName),
      copyStaticAssetsPlugin(targetName),
      copyRollHelperLogoPlugin(targetName),
    ],
  };
}
