const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const isWatchMode = args.includes('--watch');
// 获取不带 -- 的参数作为目标项目名（如 MemoryOS 或 LLMHub）
const targetProjects = args.filter(a => !a.startsWith('--'));

// 自定义 esbuild 插件，在编译结束时自动将 manifest.json 复制到对应的 dist 目录
const copyManifestPlugin = {
    name: 'copy-manifest',
    setup(build) {
        build.onEnd(() => {
            const outfile = build.initialOptions.outfile;
            const distDir = path.dirname(outfile);
            const projectDir = path.dirname(distDir);
            const manifestSrc = path.join(projectDir, 'manifest.json');
            const manifestDest = path.join(distDir, 'manifest.json');

            if (fs.existsSync(manifestSrc)) {
                fs.mkdirSync(distDir, { recursive: true });
                fs.copyFileSync(manifestSrc, manifestDest);
            }
        });
    }
};

const baseOptions = {
    bundle: true,
    format: 'esm',           // ES module 格式，适配现代浏览器插件导入
    target: ['es2022'],      // 浏览器环境目标版本
    sourcemap: true,
    minify: !isWatchMode,
    plugins: [copyManifestPlugin],
    loader: {
        '.css': 'text',
        '.html': 'text',
        '.png': 'file',
        '.jpg': 'file',
        '.jpeg': 'file',
        '.gif': 'file',
        '.webp': 'file',
        '.svg': 'file',
    },
};

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
 * @returns {import('vite').InlineConfig} Vite 内联配置。
 */
function createViteConfig(target) {
  const rootDir = process.cwd();
  const entryFile = path.resolve(rootDir, target.entry);
  const outDir = path.resolve(rootDir, target.outDir);
  const projectDir = path.resolve(rootDir, target.projectDir);
  return {
    configFile: false,
    publicDir: false,
    plugins: [createCopyManifestPlugin(projectDir, outDir)],
    build: {
      target: "es2022",
      sourcemap: true,
      minify: isWatchMode ? false : "esbuild",
      cssMinify: isWatchMode ? false : "esbuild",
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
          codeSplitting: false,
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
    const { build } = await import("vite");
    if (isWatchMode) {
      const names = builds.map((item) => item.name).join(", ");
      console.log(`启动 Vite watch 模式: [${names}]`);
      for (const target of builds) {
        await build(createViteConfig(target));
      }
      return;
    }

    console.log("开始执行 Vite 构建...");
    for (const target of builds) {
      await build(createViteConfig(target));
      console.log(`构建完成: ${target.outDir}/index.js`);
    }
    console.log("全部构建完成。");
  } catch (error) {
    console.error("Vite 构建失败:", error);
    process.exit(1);
  }
}

runBuild();
