import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * 功能：提供 MemoryOS testbed 独立构建配置。
 * @returns Vite 配置对象。
 */
export default defineConfig({
    root: resolve(__dirname),
    server: {
        port: 5186,
        strictPort: false,
    },
    build: {
        outDir: resolve(__dirname, '../dist-testbed'),
        emptyOutDir: true,
    },
});
