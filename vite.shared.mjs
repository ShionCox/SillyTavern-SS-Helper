import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_TARGETS = {
  MemoryOS: {
    entry: "MemoryOS/src/index.ts",
    outDir: "dist/MemoryOS",
    manifest: "MemoryOS/manifest.json",
    format: "es",
  },
  LLMHub: {
    entry: "LLMHub/src/index.ts",
    outDir: "dist/LLMHub",
    manifest: "LLMHub/manifest.json",
    format: "es",
  },
  RollHelper: {
    entry: "RollHelper/index.ts",
    outDir: "dist/RollHelper",
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
      const target = PROJECT_TARGETS[targetName];
      if (!target) return;

      const source = path.resolve(ROOT_DIR, "assets/font/思源宋体.otf");
      const destination = path.resolve(ROOT_DIR, target.outDir, "assets/font/思源宋体.otf");
      if (!fs.existsSync(source)) return;

      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    },
  };
}

/**
 * 功能：递归复制指定目录到构建产物目录，保留原有层级结构。
 * @param sourceDir 源目录绝对路径
 * @param destinationDir 目标目录绝对路径
 * @returns void
 */
function copyDirectoryRecursive(sourceDir, destinationDir) {
  if (!fs.existsSync(sourceDir)) return;

  fs.mkdirSync(destinationDir, { recursive: true });
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  entries.forEach((entry) => {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, destinationPath);
      return;
    }

    fs.copyFileSync(sourcePath, destinationPath);
  });
}

/**
 * 功能：将 Font Awesome 运行时所需的 CSS 与字体资源复制到目标产物目录。
 * @param targetName 当前构建目标名称
 * @returns Vite closeBundle 插件对象
 */
function copyFontAwesomeAssetsPlugin(targetName) {
  return {
    name: `copy-fontawesome-assets:${targetName}`,
    closeBundle() {
      const target = PROJECT_TARGETS[targetName];
      if (!target) return;

      const source = path.resolve(ROOT_DIR, "assets/fontawesome");
      const destination = path.resolve(ROOT_DIR, target.outDir, "assets/fontawesome");
      copyDirectoryRecursive(source, destination);
    },
  };
}

function copyRollHelperLogoPlugin(targetName) {
  return {
    name: `copy-rollhelper-logo:${targetName}`,
    closeBundle() {
      if (targetName !== "RollHelper") return;
      const target = PROJECT_TARGETS[targetName];
      if (!target) return;
      const source = path.resolve(ROOT_DIR, "assets/images/ROLL-LOGO.png");
      const destination = path.resolve(ROOT_DIR, target.outDir, "assets/images/ROLL-LOGO.png");
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
      const escaped = basename.replace(/"/g, '\\"');
      return `var __assetPath = "./assets/images/${escaped}"; export default new URL(__assetPath, import.meta.url).href;`;
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
      cssMinify: options.watch ? false : "esbuild",
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
          codeSplitting: false,
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
      copyFontAwesomeAssetsPlugin(targetName),
      copyRollHelperLogoPlugin(targetName),
    ],
  };
}
