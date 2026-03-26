import { defineConfig } from 'vite';

/**
 * 功能：提供 MemoryOS 独立测试台的 Vite 配置，不参与正式构建产物。
 * @returns Vite 测试台配置。
 */
export default defineConfig({
    server: {
        port: 5186,
        strictPort: false,
    },
});

