const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const isWatchMode = args.includes("--watch") || process.env.STX_BUILD_WATCH === "1";
const targetProjects = args.filter((item) => !item.startsWith("--"));

const allBuilds = [
  {
    name: "MemoryOS",
    entry: "MemoryOS/src/index.ts",
    outDir: "MemoryOS/dist",
    projectDir: "MemoryOS",
  },
  {
    name: "LLMHub",
    entry: "LLMHub/src/index.ts",
    outDir: "LLMHub/dist",
    projectDir: "LLMHub",
  },
  {
    name: "RollHelper",
    entry: "RollHelper/index.ts",
    outDir: "RollHelper/dist",
    projectDir: "RollHelper",
  },
];

const builds =
  targetProjects.length > 0
    ? allBuilds.filter((item) =>
        targetProjects.some((target) => item.name.toLowerCase() === target.toLowerCase())
      )
    : allBuilds;

if (builds.length === 0) {
  console.error(`未找到匹配的项目: ${targetProjects.join(", ")}`);
  process.exit(1);
}

/**
 * 功能：创建复制 manifest.json 的 Vite 插件。
 * @param {string} projectDir 项目目录。
 * @param {string} distDir 构建输出目录。
 * @returns {import('vite').Plugin} Vite 插件对象。
 */
function createCopyManifestPlugin(projectDir, distDir) {
  return {
    name: "copy-manifest",
    closeBundle() {
      const manifestSrc = path.join(projectDir, "manifest.json");
      const manifestDest = path.join(distDir, "manifest.json");
      if (!fs.existsSync(manifestSrc)) {
        return;
      }
      fs.mkdirSync(distDir, { recursive: true });
      fs.copyFileSync(manifestSrc, manifestDest);
    },
  };
}

/**
 * 功能：构建单个项目的 Vite 配置。
 * @param {{name: string, entry: string, outDir: string, projectDir: string}} target 构建目标。
 * @param {() => import('vite').Plugin} unoCssVitePluginFactory UnoCSS 插件工厂函数。
 * @returns {import('vite').InlineConfig} Vite 内联配置。
 */
function createViteConfig(target, unoCssVitePluginFactory) {
  const rootDir = process.cwd();
  const entryFile = path.resolve(rootDir, target.entry);
  const outDir = path.resolve(rootDir, target.outDir);
  const projectDir = path.resolve(rootDir, target.projectDir);
  return {
    configFile: false,
    publicDir: false,
    plugins: [unoCssVitePluginFactory(), createCopyManifestPlugin(projectDir, outDir)],
    build: {
      target: "es2022",
      sourcemap: true,
      minify: isWatchMode ? false : "esbuild",
      watch: isWatchMode ? {} : null,
      emptyOutDir: false,
      outDir,
      lib: {
        entry: entryFile,
        formats: ["es"],
        fileName: () => "index.js",
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          entryFileNames: "index.js",
        },
      },
    },
  };
}

/**
 * 功能：执行 Vite 构建流程。
 * @returns {Promise<void>} 异步完成信号。
 */
async function runBuild() {
  try {
    const [{ build }, { default: unoCssVitePluginFactory }] = await Promise.all([
      import("vite"),
      import("unocss/vite"),
    ]);
    if (isWatchMode) {
      const names = builds.map((item) => item.name).join(", ");
      console.log(`启动 Vite watch 模式: [${names}]`);
      for (const target of builds) {
        await build(createViteConfig(target, unoCssVitePluginFactory));
      }
      return;
    }

    console.log("开始执行 Vite 构建...");
    for (const target of builds) {
      await build(createViteConfig(target, unoCssVitePluginFactory));
      console.log(`构建完成: ${target.outDir}/index.js`);
    }
    console.log("全部构建完成。");
  } catch (error) {
    console.error("Vite 构建失败:", error);
    process.exit(1);
  }
}

runBuild();
