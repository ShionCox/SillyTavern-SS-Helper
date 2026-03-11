const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

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
    loader: { '.css': 'text', '.html': 'text' },
};

const allBuilds = [
    {
        name: 'MemoryOS',
        ...baseOptions,
        entryPoints: ['MemoryOS/src/index.ts'],
        outfile: 'MemoryOS/dist/index.js',
    },
    {
        name: 'LLMHub',
        ...baseOptions,
        entryPoints: ['LLMHub/src/index.ts'],
        outfile: 'LLMHub/dist/index.js',
    },
    {
        name: 'RollHelper',
        ...baseOptions,
        entryPoints: ['RollHelper/index.ts'],
        outfile: 'RollHelper/dist/index.js',
    }
];

// 如果传入了目标名字，则只编译符合名字的项
const builds = targetProjects.length > 0
    ? allBuilds.filter(b => targetProjects.some(t => b.name.toLowerCase() === t.toLowerCase()))
    : allBuilds;

if (builds.length === 0) {
    console.error(`❌ 找不到匹配的项目。指定的项目：${targetProjects.join(', ')}`);
    process.exit(1);
}

async function runBuild() {
    try {
        if (isWatchMode) {
            const names = builds.map(b => b.name).join(', ');
            console.log(`🔄 启动 Watch 模式监听更改 [${names}]...`);
            for (const opt of builds) {
                // 剔除自定义的 name 属性以免干扰 esbuild
                const { name, ...esbuildOptions } = opt;
                const ctx = await esbuild.context(esbuildOptions);
                await ctx.watch();
            }
        } else {
            console.log('🚀 开始编译打包插件模块...');
            for (const opt of builds) {
                const { name, ...esbuildOptions } = opt;
                await esbuild.build(esbuildOptions);
                console.log(`✅ 成功输出: ${opt.outfile}`);
            }
            console.log('🎉 打包完成!');
        }
    } catch (error) {
        console.error('❌ 打包失败:', error);
        process.exit(1);
    }
}

runBuild();
