import { buildSharedCheckboxCard } from '../../../../_Components/sharedCheckbox';
import { buildSharedSelectField } from '../../../../_Components/sharedSelect';

/**
 * 功能：构建仅显示开关控件的复选框。
 * @param id 控件 ID。
 * @param title 控件标题。
 * @param dataTip 提示文本。
 * @returns 复选框 HTML。
 */
export function buildControlOnlyCheckbox(
    id: string,
    title: string,
    dataTip: string,
): string {
    return buildSharedCheckboxCard({
        id,
        title,
        containerClassName: 'stx-ui-inline-checkbox is-control-only',
        inputAttributes: {
            'data-tip': dataTip,
            'aria-label': title,
        },
    });
}

/**
 * 功能：构建紧凑型复选框。
 * @param id 控件 ID。
 * @param title 控件标题。
 * @param dataTip 提示文本。
 * @returns 复选框 HTML。
 */
export function buildCompactCheckbox(
    id: string,
    title: string,
    dataTip: string,
): string {
    return buildSharedCheckboxCard({
        id,
        title,
        containerClassName: 'stx-ui-inline-checkbox is-compact',
        inputAttributes: {
            'data-tip': dataTip,
            'aria-label': title,
        },
    });
}

/**
 * 功能：构建紧凑型共享下拉框。
 * @param id 控件 ID。
 * @param dataTip 提示文本。
 * @param options 选项列表。
 * @returns 下拉框 HTML。
 */
export function buildCompactSharedSelect(
    id: string,
    dataTip: string,
    options: Array<{ value: string; label: string; disabled?: boolean }>,
): string {
    return buildSharedSelectField({
        id,
        containerClassName: 'stx-shared-select-fluid stx-shared-select-inline',
        selectClassName: 'stx-ui-input',
        triggerClassName: 'stx-ui-input-full stx-shared-select-trigger-input',
        triggerAttributes: {
            'data-tip': dataTip,
        },
        options,
    });
}
