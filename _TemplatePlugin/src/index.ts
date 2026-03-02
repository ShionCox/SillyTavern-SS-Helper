import { renderTemplateSettings } from './ui/index';
import { Logger } from '../../SDK/logger';
import { Toast } from '../../SDK/toast';

export const logger = new Logger('TemplatePlugin');
export const toast = new Toast('TemplatePlugin');
export { request, respond } from '../../SDK/bus/rpc';
export { broadcast, subscribe } from '../../SDK/bus/broadcast';

// 插件核心逻辑入口点
logger.info('插件代码已加载执行，SDK Logger / Toast / Bus 初始化成功');

// 插件加载时自动初始化 UI 挂载
if (typeof document !== 'undefined') {
    renderTemplateSettings().catch((err: any) => {
        logger.error('UI 初始化失败:', err);
    });
}
