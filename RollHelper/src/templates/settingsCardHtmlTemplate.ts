import type { SettingsCardTemplateIdsEvent } from "./settingsCardTemplateTypes";
import { buildSharedButton } from "../../../_Components/sharedButton";
import { buildSharedCheckboxCard } from "../../../_Components/sharedCheckbox";
import { buildSharedInputField } from "../../../_Components/sharedInput";
import { buildSharedSelectField } from "../../../_Components/sharedSelect";
import { buildSettingPageTemplate } from "../../../_Components/Setting";
import rollLogoUrlEvent from "../../../assets/images/ROLL-LOGO.png";

/**
 * 功能：构建设置页复选卡片项。
 * @param id 控件 ID。
 * @param title 标题文案。
 * @param description 描述文案。
 * @param searchText 搜索关键词。
 * @returns 复选卡片 HTML。
 */
function buildCheckboxItemEvent(
  id: string,
  title: string,
  description: string,
  searchText: string,
  dataTip?: string,
): string {
  return buildSharedCheckboxCard({
    id,
    title,
    description,
    checkedLabel: "开启",
    uncheckedLabel: "关闭",
    containerClassName: "st-roll-item st-roll-search-item",
    copyClassName: "st-roll-item-main",
    titleClassName: "st-roll-item-title",
    descriptionClassName: "st-roll-item-desc",
    attributes: {
      "data-st-roll-search": searchText,
      ...(dataTip ? { "data-tip": dataTip } : {}),
    },
  });
}

/**
 * 功能：构建 RollHelper 设置卡片 HTML 模板。
 * @param ids 模板中使用的节点 ID 集合。
 * @returns 设置卡片 HTML 字符串。
 */
export function buildSettingsCardHtmlTemplateEvent(
  ids: SettingsCardTemplateIdsEvent,
): string {
  const contentHtml = `
        <div class="st-roll-filters flex-container">
          ${buildSharedInputField({
            id: ids.searchId,
            type: "search",
            className: "flex1",
            attributes: {
              placeholder: "搜索设置",
              "data-tip": "按关键词筛选设置项。",
            },
          })}
        </div>

        <div class="st-roll-tabs">
          <button id="${ids.tabMainId}" type="button" class="st-roll-tab is-active" data-tip="查看主设置。">
            <i class="fa-solid fa-gear"></i><span>主设置</span>
          </button>
          <button id="${ids.tabSkillId}" type="button" class="st-roll-tab" data-tip="查看技能设置。">
            <i class="fa-solid fa-bolt"></i><span>技能</span>
          </button>
          <button id="${ids.tabRuleId}" type="button" class="st-roll-tab" data-tip="查看规则设置。">
            <i class="fa-solid fa-scroll"></i><span>规则</span>
          </button>
          <button id="${ids.tabAboutId}" type="button" class="st-roll-tab" data-tip="查看插件信息。">
            <i class="fa-solid fa-circle-info"></i><span>关于</span>
          </button>
        </div>

        <div id="${ids.panelMainId}" class="st-roll-panel">
          <div class="st-roll-divider"><i class="fa-solid fa-power-off"></i><span>基础开关</span><div class="st-roll-divider-line"></div></div>

          ${buildCheckboxItemEvent(
            ids.enabledId,
            "启用事件骰子系统",
            "总开关。关掉后不再做事件检定。",
            "enable event dice plugin",
            "事件骰子系统总开关。",
            )}

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="theme ui dark light tavern">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">界面主题</div>
              <div class="st-roll-item-desc">切换设置界面外观：默认、深色、亮色或酒馆。</div>
            </div>
            <div class="st-roll-row">
              ${buildSharedSelectField({
                id: ids.themeId,
                value: "default",
                containerClassName: "st-roll-shared-select",
                options: [
                  { value: "default", label: "默认 UI" },
                  { value: "dark", label: "深色 UI" },
                  { value: "light", label: "亮色 UI" },
                  { value: "tavern", label: "酒馆 UI" },
                ],
              })}
            </div>
          </div>

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="scope protagonist all">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">事件应用范围</div>
              <div class="st-roll-item-desc">选择只处理主角，或处理全部角色。</div>
            </div>
            <div class="st-roll-row">
              ${buildSharedSelectField({
                id: ids.scopeId,
                value: "protagonist_only",
                containerClassName: "st-roll-shared-select",
                attributes: {
                  "data-tip": "设置事件作用范围。",
                },
                options: [
                  { value: "protagonist_only", label: "仅主角事件" },
                  { value: "all", label: "全部事件" },
                ],
              })}
            </div>
          </div>

          <div class="st-roll-divider"><i class="fa-solid fa-robot"></i><span>AI 协议</span><div class="st-roll-divider-line"></div></div>

          ${buildCheckboxItemEvent(
            ids.ruleId,
            "默认发送规则给 AI",
            "发送前自动加规则和摘要，减少跑偏。",
            "auto send rule inject",
            "发送前自动附加规则。",
            )}

          ${buildCheckboxItemEvent(
            ids.aiRollModeId,
            "允许 AI 决定自动/手动掷骰",
            "开：AI 可自动掷骰。关：你手动掷骰。",
            "rollMode auto manual",
            "让 AI 决定自动或手动掷骰。",
            )}

          ${buildCheckboxItemEvent(
            ids.aiRoundControlId,
            "是否开启持续轮",
            "开：AI 决定何时结束本轮。关：每次事件都开新轮。",
            "ai round end round_control end_round",
            "让 AI 决定何时结束本轮。",
            )}

          ${buildCheckboxItemEvent(
            ids.dynamicDcReasonId,
            "启用动态 DC 解释",
            "显示这次难度变化的原因。",
            "dynamic dc reason",
            "显示难度变化原因。",
            )}

          ${buildCheckboxItemEvent(
            ids.statusSystemEnabledId,
            "启用状态异常系统",
            "状态会影响后续检定结果。",
            "status debuff apply remove clear",
            "开启状态效果。",
            )}

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="status editor">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">状态编辑器</div>
              <div class="st-roll-item-desc">可手动增删改当前聊天状态。</div>
            </div>
            <div class="st-roll-actions">
              ${buildSharedButton({
                id: ids.statusEditorOpenId,
                label: "打开编辑器",
                attributes: {
                  "data-tip": "打开状态编辑器，按当前聊天管理状态。",
                },
              })}
            </div>
          </div>

          <div class="st-roll-divider"><i class="fa-solid fa-dice"></i><span>掷骰规则</span><div class="st-roll-divider-line"></div></div>

          ${buildCheckboxItemEvent(
            ids.explodingEnabledId,
            "启用爆骰",
            "满足条件时可追加掷骰。",
            "explode",
            "开启爆骰规则。",
            )}

          ${buildCheckboxItemEvent(
            ids.advantageEnabledId,
            "启用优势/劣势",
            "开启后按优势/劣势取高或取低。",
            "advantage disadvantage",
            "开启优势与劣势规则。",
            )}

          ${buildCheckboxItemEvent(
            ids.dynamicResultGuidanceId,
            "启用动态结果引导",
            "掷骰后给 AI 一句结果提示。",
            "dynamic result guidance",
            "给 AI 追加结果提示。",
            )}

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="dice sides allowed">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">限制 AI 可用骰子面数</div>
              <div class="st-roll-item-desc">AI 只能用这里列出的骰子面数。</div>
            </div>
            <div class="st-roll-row">
              ${buildSharedInputField({
                id: ids.allowedDiceSidesId,
                attributes: {
                  placeholder: "4,6,8,10,12,20,100",
                  "data-tip": "限制 AI 可用的骰子面数。",
                },
              })}
            </div>
          </div>

          <div class="st-roll-divider"><i class="fa-solid fa-route"></i><span>剧情分支</span><div class="st-roll-divider-line"></div></div>

          ${buildCheckboxItemEvent(
            ids.outcomeBranchesId,
            "启用剧情走向分支",
            "成功、失败、爆骰可走不同后果。",
            "outcome branches",
            "开启剧情分支结果。",
            )}

          ${buildCheckboxItemEvent(
            ids.explodeOutcomeId,
            "启用爆骰特殊分支",
            "爆骰时使用专用后果文本。",
            "explode outcome branch",
            "开启爆骰专属分支。",
            )}

          ${buildCheckboxItemEvent(
            ids.listOutcomePreviewId,
            "列表卡预览走向",
            "未掷骰时先预览可能结果。",
            "list outcome preview",
            "在列表里预览结果分支。",
            )}

          <div class="st-roll-divider"><i class="fa-solid fa-file-lines"></i><span>摘要注入</span><div class="st-roll-divider-line"></div></div>

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="summary detail mode">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">摘要信息等级</div>
              <div class="st-roll-item-desc">控制发给 AI 的摘要详细度。</div>
            </div>
            <div class="st-roll-row">
              ${buildSharedSelectField({
                id: ids.summaryDetailId,
                value: "minimal",
                containerClassName: "st-roll-shared-select",
                attributes: {
                  "data-tip": "设置摘要详细度。",
                },
                options: [
                  { value: "minimal", label: "简略" },
                  { value: "balanced", label: "平衡" },
                  { value: "detailed", label: "详细" },
                ],
              })}
            </div>
          </div>

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="summary rounds history">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">历史轮次数</div>
              <div class="st-roll-item-desc">每次带上最近 N 轮记录。</div>
            </div>
            <div class="st-roll-row">
              ${buildSharedInputField({
                id: ids.summaryRoundsId,
                type: "number",
                attributes: {
                  min: 1,
                  max: 10,
                  step: 1,
                  "data-tip": "设置历史轮次数量。",
                },
              })}
            </div>
          </div>

          ${buildCheckboxItemEvent(
            ids.includeOutcomeSummaryId,
            "摘要包含走向文本",
            "把本轮结果文本写进摘要。",
            "summary include outcome",
            "摘要里带上结果文本。",
            )}

          <div class="st-roll-divider"><i class="fa-solid fa-stopwatch"></i><span>时限控制</span><div class="st-roll-divider-line"></div></div>

          ${buildCheckboxItemEvent(
            ids.timeLimitEnabledId,
            "启用事件时限",
            "事件有倒计时，超时按失败处理。",
            "time limit timeout",
            "开启事件倒计时。",
            )}

          <div id="${ids.timeLimitRowId}" class="st-roll-item st-roll-search-item" data-st-roll-search="minimum time limit seconds">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">最短时限（秒）</div>
              <div class="st-roll-item-desc">AI 给的时限太短时，用这个最小值。</div>
            </div>
            <div class="st-roll-row">
              ${buildSharedInputField({
                id: ids.timeLimitMinId,
                type: "number",
                attributes: {
                  min: 1,
                  step: 1,
                  "data-tip": "设置最短倒计时秒数。",
                },
              })}
            </div>
          </div>

          <div class="st-roll-tip st-roll-search-item" data-st-roll-search="prompt summary status block">
            发送前会自动加入规则、摘要和状态。
          </div>
        </div>

        <div id="${ids.panelSkillId}" class="st-roll-panel" hidden>
          <div class="st-roll-divider"><i class="fa-solid fa-bolt"></i><span>技能系统</span><div class="st-roll-divider-line"></div></div>

          ${buildCheckboxItemEvent(
            ids.skillEnabledId,
            "启用技能系统",
            "关掉后，技能加值不再生效。",
            "skill system enable",
            "开启技能系统。",
            )}

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="skill editor modal">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">技能编辑器</div>
              <div class="st-roll-item-desc">在这里编辑技能预设和加值。</div>
            </div>
            <div class="st-roll-actions">
              ${buildSharedButton({
                id: ids.skillEditorOpenId,
                label: "打开编辑器",
                attributes: {
                  "data-tip": "打开技能编辑器，管理技能预设和技能表。",
                },
              })}
            </div>
          </div>

          <dialog id="${ids.skillModalId}" class="st-roll-skill-modal">
            <div class="st-roll-skill-modal-backdrop" data-skill-modal-role="backdrop"></div>
            <div class="st-roll-skill-modal-panel">
              <div class="st-roll-skill-modal-head">
                <div class="st-roll-skill-modal-title"><i class="fa-solid fa-bolt"></i><span>技能编辑器</span></div>
                ${buildSharedButton({
                  id: ids.skillModalCloseId,
                  label: "关闭",
                  variant: "secondary",
                  className: "st-roll-skill-modal-close",
                  attributes: {
                    "data-tip": "关闭技能编辑器。",
                  },
                })}
              </div>

              <div class="st-roll-skill-modal-body">
                <div id="${ids.skillPresetLayoutId}" class="st-roll-workbench st-roll-skill-layout">
                  <aside id="${ids.skillPresetSidebarId}" class="st-roll-workbench-sidebar st-roll-skill-presets">
                    <div class="st-roll-workbench-toolbar st-roll-workbench-toolbar-sidebar">
                      ${buildSharedInputField({
                        id: `${ids.skillModalId}__preset_search`,
                        type: "search",
                        className: "st-roll-skill-preset-search flex1",
                        attributes: {
                          placeholder: "搜索预设",
                          "data-tip": "按预设名搜索技能预设。",
                        },
                      })}
                      ${buildSharedSelectField({
                        id: `${ids.skillModalId}__preset_sort`,
                        value: "recent",
                        containerClassName: "st-roll-workbench-select",
                        selectClassName: "st-roll-skill-preset-sort",
                        triggerAttributes: {
                          "data-tip": "切换预设排序方式",
                        },
                        options: [
                          { value: "recent", label: "最近更新" },
                          { value: "name", label: "按名称" },
                          { value: "count", label: "按技能数" },
                        ],
                      })}
                    </div>

                    <div class="st-roll-workbench-sidebar-head st-roll-skill-presets-head">
                      <div class="st-roll-workbench-sidebar-copy">
                        <span class="st-roll-field-label">技能预设</span>
                        <div id="${ids.skillPresetMetaId}" class="st-roll-skill-preset-meta"></div>
                      </div>
                      <div class="st-roll-actions">
                        ${buildSharedButton({
                          id: ids.skillPresetCreateId,
                          label: "新建",
                          iconClassName: "fa-solid fa-plus",
                          attributes: {
                            "data-tip": "基于当前预设复制并新建一个预设。",
                          },
                        })}
                        ${buildSharedButton({
                          id: ids.skillPresetDeleteId,
                          label: "删除",
                          variant: "danger",
                          iconClassName: "fa-solid fa-trash",
                          attributes: {
                            "data-tip": "删除当前技能预设。",
                          },
                        })}
                        ${buildSharedButton({
                          id: ids.skillPresetRestoreDefaultId,
                          label: "恢复默认",
                          variant: "secondary",
                          iconClassName: "fa-solid fa-rotate-left",
                          attributes: {
                            "data-tip": "恢复默认技能预设的内置内容。",
                          },
                        })}
                      </div>
                    </div>
                    <div id="${ids.skillPresetListId}" class="st-roll-skill-preset-list"></div>
                  </aside>

                  <section id="${ids.skillEditorWrapId}" class="st-roll-workbench-main st-roll-skill-main">
                    <div class="st-roll-workbench-context st-roll-skill-preset-header">
                      <div class="st-roll-row st-roll-skill-rename-row">
                        <span class="st-roll-field-label">预设名称</span>
                        ${buildSharedInputField({
                          id: ids.skillPresetNameId,
                          className: "st-roll-skill-preset-name-input",
                          attributes: {
                            placeholder: "输入预设名称",
                            "data-tip": "修改当前技能预设名称。",
                          },
                        })}
                        ${buildSharedButton({
                          id: ids.skillPresetRenameId,
                          label: "保存名称",
                          variant: "secondary",
                          attributes: {
                            "data-tip": "保存当前预设名称。",
                          },
                        })}
                      </div>
                      <div class="st-roll-tip">名称必填；修正值必须是整数。支持搜索、排序、批量删除、复制与上下移动。</div>
                    </div>

                    <div class="st-roll-workbench-toolbar st-roll-skill-toolbar">
                      ${buildSharedInputField({
                        id: `${ids.skillModalId}__skill_search`,
                        type: "search",
                        className: "st-roll-skill-row-search flex1",
                        attributes: {
                          placeholder: "搜索技能",
                          "data-tip": "按技能名筛选当前预设中的技能。",
                        },
                      })}
                      ${buildSharedSelectField({
                        id: `${ids.skillModalId}__skill_sort`,
                        value: "manual",
                        containerClassName: "st-roll-workbench-select",
                        selectClassName: "st-roll-skill-row-sort",
                        triggerAttributes: {
                          "data-tip": "切换技能排序方式",
                        },
                        options: [
                          { value: "manual", label: "手动顺序" },
                          { value: "name", label: "按名称" },
                          { value: "modifier_desc", label: "按修正值" },
                        ],
                      })}
                      <span class="st-roll-workbench-selection st-roll-skill-selection-count">已选 0 项</span>
                      ${buildSharedButton({
                        label: "全选可见",
                        variant: "secondary",
                        className: "st-roll-skill-select-visible",
                        attributes: {
                          "data-tip": "选中当前筛选结果中的全部技能。",
                        },
                      })}
                      ${buildSharedButton({
                        label: "清空选择",
                        variant: "secondary",
                        className: "st-roll-skill-clear-selection",
                        attributes: {
                          "data-tip": "取消当前技能选择。",
                        },
                      })}
                      ${buildSharedButton({
                        label: "批量删除",
                        variant: "danger",
                        className: "st-roll-skill-batch-delete",
                        attributes: {
                          "data-tip": "删除当前已选择的技能。",
                        },
                      })}
                    </div>

                    <div id="${ids.skillDirtyHintId}" class="st-roll-skill-dirty" hidden>技能改动尚未保存，点击“保存技能表”后生效。</div>
                    <div id="${ids.skillErrorsId}" class="st-roll-skill-errors" hidden></div>

                    <div class="st-roll-workbench-toolbar st-roll-workbench-toolbar-main st-roll-skill-head">
                      <div class="st-roll-workbench-head-copy">
                        <span class="st-roll-field-label">技能表</span>
                        <span class="st-roll-workbench-subtitle">按当前预设隔离，支持复制、移动和批量操作。</span>
                      </div>
                      <div class="st-roll-actions">
                        ${buildSharedButton({
                          id: ids.skillAddId,
                          label: "新增技能",
                          iconClassName: "fa-solid fa-plus",
                          attributes: {
                            "data-tip": "新增一条技能记录。",
                          },
                        })}
                        ${buildSharedButton({
                          id: ids.skillSaveId,
                          label: "保存技能表",
                          iconClassName: "fa-solid fa-floppy-disk",
                          attributes: {
                            "data-tip": "保存当前预设技能表。",
                          },
                        })}
                        ${buildSharedButton({
                          id: ids.skillResetId,
                          label: "重置为空",
                          variant: "secondary",
                          attributes: {
                            "data-tip": "清空当前预设技能草稿。",
                          },
                        })}
                        ${buildSharedButton({
                          id: ids.skillImportToggleId,
                          label: "导入 JSON",
                          variant: "secondary",
                          attributes: {
                            "data-tip": "展开或收起 JSON 导入区域。",
                          },
                        })}
                        ${buildSharedButton({
                          id: ids.skillExportId,
                          label: "导出 JSON",
                          variant: "secondary",
                          attributes: {
                            "data-tip": "导出当前预设技能表 JSON。",
                          },
                        })}
                      </div>
                    </div>

                    <div class="st-roll-skill-cols"><span>技能名称</span><span>修正值</span><span>操作</span></div>
                    <div id="${ids.skillRowsId}" class="st-roll-skill-rows"></div>

                    <div id="${ids.skillImportAreaId}" class="st-roll-skill-import" hidden>
                      <div class="st-roll-row st-roll-workbench-toolbar-main" style="margin-bottom:8px;">
                        <span class="st-roll-field-label">粘贴 JSON 后点击应用</span>
                        <div class="st-roll-actions">
                          ${buildSharedButton({
                            id: ids.skillImportApplyId,
                            label: "应用导入",
                            attributes: {
                              "data-tip": "把文本框内的 JSON 解析为技能表。",
                            },
                          })}
                        </div>
                      </div>
                      ${buildSharedInputField({
                        id: ids.skillTextId,
                        tag: "textarea",
                        attributes: {
                          rows: 7,
                          placeholder: '{"察觉":10,"说服":8}',
                          "data-tip": "导入技能表 JSON。",
                        },
                      })}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </dialog>
        </div>

        <div id="${ids.panelRuleId}" class="st-roll-panel" hidden>
          <div class="st-roll-divider"><i class="fa-solid fa-scroll"></i><span>事件协议规则</span><div class="st-roll-divider-line"></div></div>

          <div class="st-roll-textarea-wrap st-roll-search-item" data-st-roll-search="rule text save reset">
            <div class="st-roll-row" style="margin-bottom:8px;">
              <span class="st-roll-field-label">这里写补充规则。系统基础规则会自动放在前面。</span>
              <div class="st-roll-actions">
                ${buildSharedButton({
                  id: ids.ruleSaveId,
                  label: "保存补充",
                  attributes: {
                    "data-tip": "保存补充规则文本。",
                  },
                })}
                ${buildSharedButton({
                  id: ids.ruleResetId,
                  label: "清空补充",
                  variant: "secondary",
                  attributes: {
                    "data-tip": "清空补充规则文本。",
                  },
                })}
              </div>
            </div>
            ${buildSharedInputField({
              id: ids.ruleTextId,
              tag: "textarea",
              attributes: {
                rows: 12,
                "data-tip": "编辑补充规则文本。",
                placeholder:
                  "只写额外约束，例如：\n1. 场景以潜入风格推进。\n2. outcomes 文本避免重复措辞。\n3. 优势/劣势触发时加强叙事差异。",
              },
            })}
          </div>
        </div>

        <div id="${ids.panelAboutId}" class="st-roll-panel" hidden>
          <div class="st-roll-divider"><i class="fa-solid fa-circle-info"></i><span>关于插件</span><div class="st-roll-divider-line"></div></div>

          <div class="st-roll-item st-roll-search-item st-roll-about-item" data-st-roll-search="about version author email github" style="margin-bottom: 12px; align-items: flex-start;">
            <div class="st-roll-item-main">
              <img class="st-roll-about-logo" src="${rollLogoUrlEvent}" alt="RollHelper Logo" />
              <div class="st-roll-item-title" style="display: flex; align-items: center; justify-content: center;font-size:18px;margin-bottom: 20px;">${ids.displayName}</div>
              <div class="st-roll-item-desc st-roll-about-meta">
                <span class="st-roll-about-meta-item">
                  <i class="fa-solid fa-tag"></i>
                  <span>版本：${ids.badgeText}</span>
                </span>
                <span class="st-roll-about-meta-item">
                  <i class="fa-solid fa-user"></i>
                  <span>作者：${ids.authorText}</span>
                </span>
                <span class="st-roll-about-meta-item">
                  <i class="fa-solid fa-envelope"></i>
                  <span>邮箱：<a href="mailto:${ids.emailText}">${ids.emailText}</a></span>
                </span>
                <span class="st-roll-about-meta-item">
                  <i class="fa-brands fa-qq"></i>
                  <span>QQ群：${ids.qqGroupText}</span>
                </span>
                <span class="st-roll-about-meta-item">
                  <i class="fa-brands fa-github"></i>
                  <span>GitHub：<a href="${ids.githubUrl}" target="_blank" rel="noopener">${ids.githubText}</a></span>
                </span>
              </div>
            </div>
          </div>

          <div class="st-roll-item st-roll-search-item st-roll-changelog-item" data-st-roll-search="更新日志 版本 历史 修复 新增 优化 调整 文档">
            <div class="st-roll-item-title">更新日志</div>
            ${ids.changelogHtml}
          </div>

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="command eventroll roll list help">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">常用命令</div>
              <div class="st-roll-item-desc">常用命令：/roll 1d20、/eventroll list、/eventroll roll &lt;id&gt;</div>
            </div>
          </div>
        </div>
  `;

  return `
    ${buildSettingPageTemplate({
      drawerToggleId: ids.drawerToggleId,
      drawerContentId: ids.drawerContentId,
      drawerIconId: ids.drawerIconId,
      title: ids.displayName,
      badgeId: ids.badgeId,
      badgeText: ids.badgeText,
      shellClassName: "st-roll-shell",
      headerClassName: "st-roll-head",
      contentClassName: "st-roll-content",
      titleClassName: "st-roll-head-title",
      badgeClassName: "st-roll-head-badge",
      contentHtml,
    })}

    <dialog id="${ids.statusModalId}" class="st-roll-status-modal">
      <div class="st-roll-status-modal-backdrop" data-status-modal-role="backdrop"></div>
      <div class="st-roll-status-modal-panel">
        <div class="st-roll-status-modal-head">
          <div class="st-roll-status-modal-title">
            <i class="fa-solid fa-heart-pulse"></i><span>状态编辑器</span>
          </div>
          ${buildSharedButton({
            id: ids.statusModalCloseId,
            label: "关闭",
            variant: "secondary",
            className: "st-roll-status-modal-close",
            attributes: {
              "data-tip": "关闭状态编辑器。",
            },
          })}
        </div>
        <div class="st-roll-status-modal-body">
          <div id="${ids.statusLayoutId}" class="st-roll-workbench st-roll-status-layout">
            <aside id="${ids.statusSidebarId}" class="st-roll-workbench-sidebar st-roll-status-sidebar">
              <div class="st-roll-workbench-toolbar st-roll-workbench-toolbar-sidebar">
                ${buildSharedInputField({
                  id: `${ids.statusModalId}__chat_search`,
                  type: "search",
                  className: "st-roll-status-chat-search flex1",
                  attributes: {
                    placeholder: "搜索聊天",
                    "data-tip": "按聊天名或聊天 ID 搜索。",
                  },
                })}
                ${buildSharedSelectField({
                  id: `${ids.statusModalId}__chat_source`,
                  value: "all",
                  containerClassName: "st-roll-workbench-select",
                  selectClassName: "st-roll-status-chat-source",
                  triggerAttributes: {
                    "data-tip": "按聊天来源筛选。",
                  },
                  options: [
                    { value: "all", label: "全部来源" },
                    { value: "current", label: "仅当前" },
                    { value: "local", label: "仅本地" },
                    { value: "memory", label: "仅记忆库" },
                  ],
                })}
                ${buildSharedButton({
                  id: ids.statusRefreshId,
                  label: "刷新",
                  variant: "secondary",
                  iconClassName: "fa-solid fa-rotate",
                  attributes: {
                    "data-tip": "刷新当前酒馆可见的聊天列表。",
                  },
                })}
                ${buildSharedButton({
                  id: ids.statusCleanUnusedId,
                  label: "清理无用聊天",
                  variant: "danger",
                  iconClassName: "fa-solid fa-trash",
                  attributes: {
                    "data-tip": "根据当前酒馆的聊天列表，清理 RollHelper 本地已无用的聊天状态记录。",
                  },
                })}
              </div>

              <div class="st-roll-workbench-sidebar-head st-roll-status-sidebar-head">
                <div class="st-roll-workbench-sidebar-copy st-roll-status-head-main">
                  <span class="st-roll-field-label">聊天列表</span>
                  <span id="${ids.statusMemoryStateId}" class="st-roll-status-memory-state">记忆库：检测中</span>
                </div>
              </div>
              <div id="${ids.statusChatListId}" class="st-roll-status-chat-list"></div>
            </aside>
            <div
              id="${ids.statusSplitterId}"
              class="st-roll-status-splitter"
              role="separator"
              aria-orientation="vertical"
              aria-label="调整聊天侧栏宽度"
            ></div>
            <section class="st-roll-workbench-main st-roll-status-main">
              <div class="st-roll-status-mobile-sheet-head">
                ${buildSharedButton({
                  label: "返回聊天",
                  variant: "secondary",
                  iconClassName: "fa-solid fa-chevron-left",
                  className: "st-roll-status-mobile-back",
                  attributes: {
                    "data-tip": "收起当前聊天的状态编辑抽屉。",
                  },
                })}
                <div class="st-roll-status-mobile-sheet-copy">
                  <span class="st-roll-field-label">聊天状态编辑</span>
                </div>
              </div>
              <div class="st-roll-workbench-context st-roll-status-context">
                <div class="st-roll-workbench-head-copy">
                  <span class="st-roll-field-label">状态列表（按聊天隔离）</span>
                  <div id="${ids.statusChatMetaId}" class="st-roll-status-chat-meta">未选择聊天</div>
                </div>
                <div class="st-roll-tip">名称必填；修正值必须是整数；按技能时技能列表不能为空。支持搜索、范围筛选、批量启用与批量删除。</div>
              </div>

              <div class="st-roll-workbench-toolbar st-roll-status-toolbar">
                ${buildSharedInputField({
                  id: `${ids.statusModalId}__status_search`,
                  type: "search",
                  className: "st-roll-status-search flex1",
                  attributes: {
                    placeholder: "搜索状态",
                    "data-tip": "按状态名称搜索当前聊天中的状态。",
                  },
                })}
                ${buildSharedSelectField({
                  id: `${ids.statusModalId}__status_scope`,
                  value: "all",
                  containerClassName: "st-roll-workbench-select",
                  selectClassName: "st-roll-status-scope-filter",
                  triggerAttributes: {
                    "data-tip": "按状态作用范围筛选。",
                  },
                  options: [
                    { value: "all", label: "全部范围" },
                    { value: "skills", label: "按技能" },
                    { value: "global", label: "全局" },
                  ],
                })}
                <label class="st-roll-inline-toggle" data-tip="只显示当前已启用的状态。">
                  <input type="checkbox" class="st-roll-status-only-enabled" />
                  <span>仅看启用</span>
                </label>
                <span class="st-roll-workbench-selection st-roll-status-selection-count">已选 0 项</span>
                ${buildSharedButton({
                  label: "全选可见",
                  variant: "secondary",
                  iconClassName: "fa-solid fa-check-double",
                  className:
                    "st-roll-status-select-visible st-roll-toolbar-icon-btn",
                  attributes: {
                    "data-tip": "选中当前筛选结果中的全部状态。",
                  },
                })}
                ${buildSharedButton({
                  label: "启用所选",
                  variant: "secondary",
                  iconClassName: "fa-solid fa-check",
                  className:
                    "st-roll-status-batch-enable st-roll-toolbar-icon-btn",
                  attributes: {
                    "data-tip": "批量启用当前选择的状态。",
                  },
                })}
                ${buildSharedButton({
                  label: "禁用所选",
                  variant: "secondary",
                  iconClassName: "fa-solid fa-ban",
                  className:
                    "st-roll-status-batch-disable st-roll-toolbar-icon-btn",
                  attributes: {
                    "data-tip": "批量禁用当前选择的状态。",
                  },
                })}
                ${buildSharedButton({
                  label: "删除所选",
                  variant: "danger",
                  iconClassName: "fa-solid fa-trash",
                  className:
                    "st-roll-status-batch-delete st-roll-toolbar-icon-btn",
                  attributes: {
                    "data-tip": "删除当前选择的状态。",
                  },
                })}
              </div>

              <div class="st-roll-workbench-toolbar st-roll-workbench-toolbar-main st-roll-status-head">
                <div class="st-roll-workbench-head-copy">
                  <span class="st-roll-field-label">状态表</span>
                  <span class="st-roll-workbench-subtitle">支持复制状态、批量启用/禁用、按范围筛选。</span>
                </div>
                <div class="st-roll-actions">
                  ${buildSharedButton({
                    id: ids.statusAddId,
                    label: "新增状态",
                    iconClassName: "fa-solid fa-plus",
                    attributes: {
                      "data-tip": "新增一条状态。",
                    },
                  })}
                  ${buildSharedButton({
                    id: ids.statusSaveId,
                    label: "保存",
                    iconClassName: "fa-solid fa-floppy-disk",
                    attributes: {
                      "data-tip": "保存当前聊天的状态表。",
                    },
                  })}
                  ${buildSharedButton({
                    id: ids.statusResetId,
                    label: "重置",
                    variant: "secondary",
                    attributes: {
                      "data-tip": "清空当前聊天的状态草稿。",
                    },
                  })}
                </div>
              </div>

              <div id="${ids.statusColsId}" class="st-roll-status-cols">
                <span class="st-roll-status-col-head" data-status-col-key="name">名称<div class="st-roll-status-col-resizer" data-status-col-resize-key="name"></div></span>
                <span class="st-roll-status-col-head" data-status-col-key="modifier">修正<div class="st-roll-status-col-resizer" data-status-col-resize-key="modifier"></div></span>
                <span class="st-roll-status-col-head" data-status-col-key="duration">轮次<div class="st-roll-status-col-resizer" data-status-col-resize-key="duration"></div></span>
                <span class="st-roll-status-col-head" data-status-col-key="scope">范围<div class="st-roll-status-col-resizer" data-status-col-resize-key="scope"></div></span>
                <span class="st-roll-status-col-head" data-status-col-key="skills">技能（| 分隔）<div class="st-roll-status-col-resizer" data-status-col-resize-key="skills"></div></span>
                <span class="st-roll-status-col-head" data-status-col-key="enabled">启用<div class="st-roll-status-col-resizer" data-status-col-resize-key="enabled"></div></span>
                <span class="st-roll-status-col-head" data-status-col-key="actions">操作</span>
              </div>
              <div id="${ids.statusRowsId}" class="st-roll-status-rows"></div>
              <div class="st-roll-status-footer">
                <div id="${ids.statusErrorsId}" class="st-roll-status-errors" hidden></div>
                <div id="${ids.statusDirtyHintId}" class="st-roll-status-dirty" hidden>当前聊天有未保存修改。</div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </dialog>
  `;
}
