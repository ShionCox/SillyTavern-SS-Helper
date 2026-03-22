import recordEditorBaseCssText from './base.css?inline';
import recordEditorCssText from './recordEditor.css?inline';

/**
 * 功能：返回记录编辑器的独立样式文本。
 * @returns 记录编辑器完整样式字符串。
 */
export function buildRecordEditorStyles(): string {
    return `${recordEditorBaseCssText}\n${recordEditorCssText}`;
}
