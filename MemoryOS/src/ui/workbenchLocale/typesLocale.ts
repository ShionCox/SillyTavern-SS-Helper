const TYPES_TEXT_MAP: Record<string, string> = {
    section_title: '类型工坊',
    create_type: '新建类型',
    key_name: '键名',
    built_in: '系统内置',
    user_defined: '用户自定义',
    inject_to_system: '注入系统上下文',
    record_only: '仅作条目记录',
    preset_core_type: '预置核心类型',
    custom_type: '自定义类型',
    save_type: '保存类型',
    delete_type: '删除类型',
    type_key: '类型键',
    type_label: '显示名称',
    type_category: '分类',
    type_icon: '图标',
    type_color: '强调色',
    type_description: '说明',
    system_rule: '系统规则',
    inject_to_system_prompt: '注入到系统提示词',
    bind_to_actor: '允许绑定到角色',
    dynamic_fields: '动态字段定义',
    type_key_placeholder: '请输入类型键名',
    type_label_placeholder: '例如：派系',
    type_category_placeholder: '输入分类',
    type_icon_placeholder: '请输入图标类名',
    type_color_placeholder: '十六进制颜色值',
    type_description_placeholder: '描述该类型的用途',
    field_schema_placeholder: '[{"key":"区域","label":"所属区域","kind":"text"}]',
};

/**
 * 功能：读取类型工坊固定文案。
 * @param key 文案键名。
 * @returns 中文文案。
 */
export function resolveTypesWorkbenchText(key: string): string {
    const normalized = String(key ?? '').trim();
    if (!normalized) {
        return '';
    }
    return TYPES_TEXT_MAP[normalized] ?? normalized;
}
