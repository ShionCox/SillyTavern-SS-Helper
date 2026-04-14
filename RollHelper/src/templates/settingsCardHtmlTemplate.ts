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
                containerClassName: "stx-shared-select-flex-220",
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
                containerClassName: "stx-shared-select-flex-220",
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
            ids.dice3dEnabledId,
            "启用 3D 骰子动画并用其结果结算",
            "开启后，掷骰动画与最终结果都统一来自 dice-box。",
            "3d dice box animation result",
            "开启 3D 骰子并统一用 3D 结果结算。",
            )}

          ${buildCheckboxItemEvent(
            ids.rerollEnabledId,
            "启用重新投掷功能",
            "开启后，可在结果卡中对已结算事件再次手动掷骰。",
            "reroll retry rerun result card",
            "允许在结果卡中重新投掷当前事件。",
            )}

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

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="enabled dice type ai dice d20 d6 d100">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">AI 可用骰式</div>
              <div class="st-roll-item-desc">只允许 AI 从已开启的骰式中选取。默认仅开启 d20。</div>
            </div>
            <div class="st-roll-row">
              <div id="${ids.allowedDiceSidesId}" class="st-roll-dice-toggle-group" data-tip="选择允许 AI 使用的骰式。">
                ${[4, 6, 8, 10, 12, 20, 100]
                  .map(
                    (sides) => `
                      <label class="st-roll-dice-toggle">
                        <input type="checkbox" value="${sides}" />
                        <span>d${sides}</span>
                      </label>
                    `
                  )
                  .join("")}
              </div>
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
            "列表卡预览走向（可能剧透）",
            "在未掷骰前预览成功、失败、爆骰后果。建议默认关闭；开启后可能削弱暗骰与悬疑体验。",
            "list outcome preview",
            "开启后会在事件列表中提前显示可能走向，可能剧透未结算事件后果。",
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
                containerClassName: "stx-shared-select-flex-220",
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

        <div id="${ids.panelAiId}" class="st-roll-panel" hidden>
          <div class="st-roll-divider"><i class="fa-solid fa-robot"></i><span>AI 对接</span><div class="st-roll-divider-line"></div></div>

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="llmhub bridge status online">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">LLMHub 连接状态</div>
              <div class="st-roll-item-desc">用于确认骰子插件是否被 LLMHub 在线识别。</div>
            </div>
            <div class="st-roll-ai-bridge-status">
              <span id="${ids.aiBridgeStatusLightId}" class="st-roll-ai-bridge-light is-offline"></span>
              <span id="${ids.aiBridgeStatusTextId}" class="st-roll-ai-bridge-text">未检测</span>
            </div>
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
                    <div class="st-roll-workbench-toolbar st-roll-workbench-toolbar-sidebar st-roll-skill-preset-toolbar">
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
                        containerClassName: "stx-shared-select-width-sm",
                        selectClassName: "st-roll-skill-preset-sort",
                        triggerClassName: "stx-shared-select-trigger-compact",
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
                        containerClassName: "stx-shared-select-workbench",
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

                    <div id="${ids.skillColsId}" class="st-roll-skill-cols">
                      <span class="st-roll-skill-col-head" data-skill-col-key="name">技能名称<div class="st-roll-skill-col-resizer" data-skill-col-resize-key="name"></div></span>
                      <span class="st-roll-skill-col-head" data-skill-col-key="modifier">修正值<div class="st-roll-skill-col-resizer" data-skill-col-resize-key="modifier"></div></span>
                      <span class="st-roll-skill-col-head" data-skill-col-key="actions">操作<div class="st-roll-skill-col-resizer" data-skill-col-resize-key="actions"></div></span>
                    </div>
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

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="prompt verbosity compact verbose token protocol">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">提示词密度</div>
              <div class="st-roll-item-desc">紧凑模式默认发送最小协议；详细模式会保留更多解释与示例，适合排查模型不稳定输出。</div>
            </div>
            <div class="st-roll-row">
              ${buildSharedSelectField({
                id: ids.promptVerbosityId,
                value: "compact",
                containerClassName: "stx-shared-select-flex-220",
                options: [
                  { value: "compact", label: "紧凑协议" },
                  { value: "verbose", label: "详细协议" },
                ],
              })}
            </div>
          </div>

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

          <div class="st-roll-divider"><i class="fa-solid fa-eye-slash"></i><span>暗骰与隐匿检定</span><div class="st-roll-divider-line"></div></div>

          ${buildCheckboxItemEvent(
            ids.interactiveTriggersEnabledId,
            "启用上下文触发",
            "允许 AI 在回复里标记可交互线索词，点击或划词后弹出检定菜单。",
            "interactive trigger highlight tooltip context",
            "开启叙事片段触发检定。"
            )}

          ${buildCheckboxItemEvent(
            ids.selectionFallbackEnabledId,
            "启用自由划词兜底检定",
            "允许玩家对未被 AI 标记为 rh-trigger 的正文片段发起有限次数的兜底调查。默认开启，且默认按句数限制；句数会统计完整句和有意义残片。",
            "selection fallback trigger short phrase sentence limit",
            "开启后，自由划词仅作为有限次数的兜底调查入口。"
            )}

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="selection fallback limit mode sentence char count">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">自由划词限制模式</div>
              <div class="st-roll-item-desc">二选一生效。按字数限制时使用整段长度；按句数限制时会统计完整句和有意义残片，默认最多两句。</div>
            </div>
            <div class="st-roll-row">
              ${buildSharedSelectField({
                id: ids.selectionFallbackLimitModeId,
                value: "sentence_count",
                containerClassName: "stx-shared-select-flex-220",
                options: [
                  { value: "sentence_count", label: "按句数限制" },
                  { value: "char_count", label: "按字数限制" },
                ],
              })}
            </div>
          </div>

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="selection fallback max per round limit">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">每轮自由划词上限</div>
              <div class="st-roll-item-desc">限制同一未结束轮次中，玩家最多能发起多少次自由划词兜底检定。</div>
            </div>
            <div class="st-roll-row">
              ${buildSharedInputField({
                id: ids.selectionFallbackMaxPerRoundId,
                type: "number",
                attributes: {
                  min: 1,
                  step: 1,
                  "data-tip": "设置每轮自由划词兜底检定上限。",
                },
              })}
            </div>
          </div>

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="selection fallback max per floor limit">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">每楼层自由划词上限</div>
              <div class="st-roll-item-desc">限制同一条助手回复中，玩家最多能发起多少次自由划词兜底检定。</div>
            </div>
            <div class="st-roll-row">
              ${buildSharedInputField({
                id: ids.selectionFallbackMaxPerFloorId,
                type: "number",
                attributes: {
                  min: 1,
                  step: 1,
                  "data-tip": "设置每楼层自由划词兜底检定上限。",
                },
              })}
            </div>
          </div>

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="selection fallback min max text length char count">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">自由划词字数限制</div>
              <div class="st-roll-item-desc">仅在“按字数限制”模式下生效，按整段归一化后的总长度判断。</div>
            </div>
            <div class="st-roll-row" style="gap: 10px; flex-wrap: wrap;">
              ${buildSharedInputField({
                id: ids.selectionFallbackMinTextLengthId,
                type: "number",
                className: "stx-shared-input-flex-120",
                attributes: {
                  min: 1,
                  step: 1,
                  "data-tip": "设置自由划词最小长度。",
                  placeholder: "最小长度",
                },
              })}
              ${buildSharedInputField({
                id: ids.selectionFallbackMaxTextLengthId,
                type: "number",
                className: "stx-shared-input-flex-120",
                attributes: {
                  min: 1,
                  step: 1,
                  "data-tip": "设置自由划词最大长度。",
                  placeholder: "最大长度",
                },
              })}
            </div>
          </div>

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="selection fallback max sentences sentence count punctuation">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">自由划词最多句数</div>
              <div class="st-roll-item-desc">仅在“按句数限制”模式下生效，会按完整句与有意义残片统计有效句段数量。</div>
            </div>
            <div class="st-roll-row">
              ${buildSharedInputField({
                id: ids.selectionFallbackMaxSentencesId,
                type: "number",
                attributes: {
                  min: 1,
                  step: 1,
                  "data-tip": "设置按句数限制时允许的最大句数。",
                },
              })}
            </div>
          </div>

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="selection fallback action skill">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">自由划词默认动作与技能</div>
              <div class="st-roll-item-desc">自由划词只提供一个兜底入口，默认建议统一使用“调查”。</div>
            </div>
            <div class="st-roll-row" style="gap: 10px; flex-wrap: wrap;">
              ${buildSharedInputField({
                id: ids.selectionFallbackSingleActionId,
                type: "text",
                className: "stx-shared-input-flex-160",
                attributes: {
                  "data-tip": "设置自由划词兜底入口显示的动作名称。",
                  placeholder: "动作",
                },
              })}
              ${buildSharedInputField({
                id: ids.selectionFallbackSingleSkillId,
                type: "text",
                className: "stx-shared-input-flex-160",
                attributes: {
                  "data-tip": "设置自由划词兜底入口使用的技能名称。",
                  placeholder: "技能",
                },
              })}
            </div>
          </div>

          ${buildCheckboxItemEvent(
            ids.selectionFallbackDebugInfoId,
            "显示自由划词调试信息",
            "开启后可查看当前划词键、楼层键、剩余次数与去重命中情况，便于排查问题。",
            "selection fallback debug info floor key round remain",
            "开启自由划词兜底检定的调试信息展示。"
            )}

          ${buildCheckboxItemEvent(
            ids.blindRollEnabledId,
            "启用暗骰",
            "主动暗骰与事件卡暗骰都会隐藏结果，只把真实结算喂给 AI。",
            "blind roll 暗骰 hidden result",
            "开启暗骰模式。"
            )}

          <div class="st-roll-item st-roll-item-stack st-roll-editor-item st-roll-search-item" data-st-roll-search="default blind skills default blind dark skills">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">允许暗骰的技能列表</div>
              <div class="st-roll-item-desc">只有命中此列表的技能，才允许显示暗骰按钮或作为 /broll 技能模式写入叙事引导。每行、逗号或竖线分隔。</div>
            </div>
            <div class="st-roll-row st-roll-editor-row">
              <textarea id="${ids.defaultBlindSkillsId}" class="st-roll-rule-textarea" rows="6" data-tip="编辑默认暗骰技能列表。"></textarea>
            </div>
          </div>

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="blind limit max blind rolls per round">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">每轮暗骰上限</div>
              <div class="st-roll-item-desc">限制每个未结束轮次最多允许多少次暗骰。达到上限后，新暗骰不会再进入叙事引导队列。</div>
            </div>
            <div class="st-roll-row">
              ${buildSharedInputField({
                id: ids.maxBlindRollsPerRoundId,
                type: "number",
                attributes: {
                  min: 1,
                  step: 1,
                  "data-tip": "设置每轮暗骰上限。",
                },
              })}
            </div>
          </div>

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="blind queue max queued blind guidance">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">暗骰队列上限</div>
              <div class="st-roll-item-desc">限制待注入的暗骰引导最多保留多少条。队列满时将拒绝新增，避免旧暗骰堆积。</div>
            </div>
            <div class="st-roll-row">
              ${buildSharedInputField({
                id: ids.maxQueuedBlindGuidanceId,
                type: "number",
                attributes: {
                  min: 1,
                  step: 1,
                  "data-tip": "设置暗骰队列上限。",
                },
              })}
            </div>
          </div>

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="blind ttl blind guidance ttl seconds">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">暗骰过期时间（秒）</div>
              <div class="st-roll-item-desc">暗骰结果在超过该时长后失效，不再注入后续 prompt。轮次关闭后也会提前失效。</div>
            </div>
            <div class="st-roll-row">
              ${buildSharedInputField({
                id: ids.blindGuidanceTtlSecondsId,
                type: "number",
                attributes: {
                  min: 30,
                  step: 10,
                  "data-tip": "设置暗骰过期时间（秒）。",
                },
              })}
            </div>
          </div>

          ${buildCheckboxItemEvent(
            ids.blindGuidanceDedupId,
            "启用暗骰去重",
            "同轮次内重复的同类暗骰只保留一次，避免刷同技能或同事件。",
            "blind dedup queue guidance",
            "开启暗骰去重。"
            )}

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="blind dedup scope same round same floor">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">暗骰去重范围</div>
              <div class="st-roll-item-desc">控制去重按同轮次还是同楼层生效。一般建议保留“同轮次”。</div>
            </div>
            <div class="st-roll-row">
              <select id="${ids.blindDedupScopeId}" data-tip="设置暗骰去重范围。">
                <option value="same_round">同轮次</option>
                <option value="same_floor">同楼层</option>
              </select>
            </div>
          </div>

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="blind card visibility remove placeholder">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">暗骰事件卡显示策略</div>
              <div class="st-roll-item-desc">控制暗骰事件在公开事件列表中是直接移除，还是保留“已暗投”的占位卡。</div>
            </div>
            <div class="st-roll-row">
              <select id="${ids.blindEventCardVisibilityModeId}" data-tip="设置暗骰事件卡在公开面板中的显示方式。">
                <option value="remove">直接移除</option>
                <option value="placeholder">保留占位卡</option>
              </select>
            </div>
          </div>

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="blind prompt inject max count">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">单次 Prompt 最大暗投注入数</div>
              <div class="st-roll-item-desc">限制一次发给 AI 的暗骰条数，避免提示词膨胀与叙事焦点分散。</div>
            </div>
            <div class="st-roll-row">
              ${buildSharedInputField({
                id: ids.maxBlindGuidanceInjectedPerPromptId,
                type: "number",
                attributes: {
                  min: 1,
                  step: 1,
                  "data-tip": "设置单次 Prompt 最多注入多少条暗骰引导。",
                },
              })}
            </div>
          </div>

          ${buildCheckboxItemEvent(
            ids.blindHistoryDisplayConsumedAsNarrativeAppliedId,
            "暗骰已消费显示为已体现",
            "开启后，玩家侧把 consumed 解释为“已体现”，更符合叙事理解；关闭时保留“已消费”字样。",
            "blind history consumed narrative applied display",
            "控制暗骰列表对 consumed 状态的玩家显示文案。"
            )}

          ${buildCheckboxItemEvent(
            ids.blindHistoryAutoArchiveEnabledId,
            "启用暗骰历史自动归档",
            "自动把较早的已体现、已过期、已失效条目转为已归档，减少当前列表混乱。",
            "blind history auto archive",
            "开启后，旧的暗骰历史会按时间自动归档。"
            )}

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="blind history auto archive hours">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">暗骰自动归档时长（小时）</div>
              <div class="st-roll-item-desc">达到该时长后，旧的已体现、已过期、已失效条目会自动归档。</div>
            </div>
            <div class="st-roll-row">
              ${buildSharedInputField({
                id: ids.blindHistoryAutoArchiveAfterHoursId,
                type: "number",
                attributes: {
                  min: 1,
                  step: 1,
                  "data-tip": "设置暗骰历史自动归档的小时数。",
                },
              })}
            </div>
          </div>

          ${buildCheckboxItemEvent(
            ids.blindHistoryShowFloorKeyId,
            "暗骰列表显示楼层归属",
            "开启后，暗骰列表会显示所属楼层简写，方便判断它对应哪一条回复。",
            "blind history floor key",
            "控制暗骰列表是否显示楼层归属。"
            )}

          ${buildCheckboxItemEvent(
            ids.blindHistoryShowOriginId,
            "暗骰列表显示来源类型",
            "开启后，暗骰列表会区分事件暗骰、交互暗骰和命令暗骰。",
            "blind history origin source",
            "控制暗骰列表是否显示来源类型。"
            )}

          ${buildCheckboxItemEvent(
            ids.enableBlindDebugInfoId,
            "显示暗骰调试信息",
            "开启后，暗骰列表会显示更多轮次、楼层、去重键与生命周期状态，便于排查问题。",
            "blind debug info guidance state floor round dedupe",
            "开启暗骰调试信息展示。"
            )}

          ${buildCheckboxItemEvent(
            ids.passiveCheckEnabledId,
            "启用被动检定",
            "按技能表自动推导被动值，并扫描激活世界书中的 RH_PASSIVE 条目。",
            "passive check 被动检定 worldbook",
            "开启被动检定。"
            )}

          ${buildCheckboxItemEvent(
            ids.narrativeCostEnabledId,
            "失败必须附带叙事代价",
            "失败与大失败会更强地约束 AI 给出误判、暴露、资源损失或下一风险。",
            "narrative cost failure consequence enforcement",
            "开启失败叙事代价约束。"
            )}

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="passive formula base">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">被动检定基础值</div>
              <div class="st-roll-item-desc">首版公式固定为基础值 + 技能修正，默认 10。</div>
            </div>
            <div class="st-roll-row">
              ${buildSharedInputField({
                id: ids.passiveFormulaBaseId,
                type: "number",
                attributes: {
                  min: 0,
                  step: 1,
                  "data-tip": "设置被动检定基础值。",
                },
              })}
            </div>
          </div>

          <div class="st-roll-item st-roll-item-stack st-roll-editor-item st-roll-search-item" data-st-roll-search="passive aliases passive skill aliases">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">被动技能别名</div>
              <div class="st-roll-item-desc">JSON 格式，键为 perception / investigation / insight，值为技能名数组。</div>
            </div>
            <div class="st-roll-row st-roll-editor-row">
              <textarea id="${ids.passiveAliasesId}" class="st-roll-rule-textarea" rows="8" data-tip="编辑被动检定别名 JSON。"></textarea>
            </div>
          </div>

          <div class="st-roll-item st-roll-item-stack st-roll-editor-item st-roll-search-item" data-st-roll-search="worldbook passive template RH_PASSIVE">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">世界书被动模板</div>
              <div class="st-roll-item-desc">这里提供的是完整世界书条目样例，正文里已经嵌入 RH_PASSIVE，用法可直接照抄。</div>
            </div>
            <div class="st-roll-row st-roll-editor-row">
              <textarea id="${ids.worldbookPassiveTemplateId}" class="st-roll-rule-textarea" rows="8" data-tip="这是可直接写入世界书的完整 RH_PASSIVE 条目样例。"></textarea>
            </div>
            <div class="st-roll-actions st-roll-editor-actions" style="margin-top: 10px;">
              ${buildSharedButton({
                id: ids.worldbookPassiveCreateId,
                label: "写入当前世界书",
                attributes: {
                  "data-tip": "尝试把示例条目写入当前激活的世界书；失败时仍可手动复制模板。",
                },
              })}
            </div>
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
                  containerClassName: "stx-shared-select-fluid stx-shared-select-workbench",
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
                  containerClassName: "stx-shared-select-workbench-compact",
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
