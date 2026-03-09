import type { SettingsCardTemplateIdsEvent } from "./settingsCardTemplateTypes";
import { buildSharedCheckboxCard } from "../../../_Components/sharedCheckbox";

export function buildSettingsCardHtmlTemplateEvent(ids: SettingsCardTemplateIdsEvent): string {
  const buildCheckboxItem = (
    id: string,
    title: string,
    description: string,
    searchText: string
  ): string =>
    buildSharedCheckboxCard({
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
      },
    });

  return `
    <div class="inline-drawer st-roll-shell">
      <div class="inline-drawer-toggle inline-drawer-header st-roll-head" id="${ids.drawerToggleId}">
        <div class="st-roll-head-title">
          <span style="margin-bottom: 2px;">${ids.displayName}</span>
          <span id="${ids.badgeId}" class="st-roll-head-badge">${ids.badgeText}</span>
        </div>
        <div id="${ids.drawerIconId}" class="inline-drawer-icon fa-solid fa-circle-chevron-down down interactable" tabindex="0" role="button"></div>
      </div>

      <div class="inline-drawer-content st-roll-content" id="${ids.drawerContentId}" style="display:none;">
        <div class="st-roll-filters flex-container">
          <input id="${ids.searchId}" class="text_pole flex1 st-roll-search" placeholder="搜索设置" type="search" />
        </div>

        <div class="st-roll-tabs">
          <button id="${ids.tabMainId}" type="button" class="st-roll-tab is-active">
            <i class="fa-solid fa-gear"></i><span>主设置</span>
          </button>
          <button id="${ids.tabSkillId}" type="button" class="st-roll-tab">
            <i class="fa-solid fa-bolt"></i><span>技能</span>
          </button>
          <button id="${ids.tabRuleId}" type="button" class="st-roll-tab">
            <i class="fa-solid fa-scroll"></i><span>规则</span>
          </button>
          <button id="${ids.tabAboutId}" type="button" class="st-roll-tab">
            <i class="fa-solid fa-circle-info"></i><span>关于</span>
          </button>
        </div>

        <div id="${ids.panelMainId}" class="st-roll-panel">
          <div class="st-roll-divider"><i class="fa-solid fa-power-off"></i><span>基础开关</span><div class="st-roll-divider-line"></div></div>

          ${buildCheckboxItem(
            ids.enabledId,
            "启用事件骰子系统",
            "总开关。关掉后不再做事件检定。",
            "enable event dice plugin"
          )}

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="scope protagonist all">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">事件应用范围</div>
              <div class="st-roll-item-desc">选择只处理主角，或处理全部角色。</div>
            </div>
            <div class="st-roll-row">
              <select id="${ids.scopeId}" class="st-roll-select">
                <option value="protagonist_only">仅主角事件</option>
                <option value="all">全部事件</option>
              </select>
            </div>
          </div>

          <div class="st-roll-divider"><i class="fa-solid fa-robot"></i><span>AI 协议</span><div class="st-roll-divider-line"></div></div>

          ${buildCheckboxItem(
            ids.ruleId,
            "默认发送规则给 AI",
            "发送前自动加规则和摘要，减少跑偏。",
            "auto send rule inject"
          )}

          ${buildCheckboxItem(
            ids.aiRollModeId,
            "允许 AI 决定自动/手动掷骰",
            "开：AI 可自动掷骰。关：你手动掷骰。",
            "rollMode auto manual"
          )}

          ${buildCheckboxItem(
            ids.aiRoundControlId,
            "是否开启持续轮",
            "开：AI 决定何时结束本轮。关：每次事件都开新轮。",
            "ai round end round_control end_round"
          )}

          ${buildCheckboxItem(
            ids.dynamicDcReasonId,
            "启用动态 DC 解释",
            "显示这次难度变化的原因。",
            "dynamic dc reason"
          )}

          ${buildCheckboxItem(
            ids.statusSystemEnabledId,
            "启用状态异常系统",
            "状态会影响后续检定结果。",
            "status debuff apply remove clear"
          )}

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="status editor">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">状态编辑器</div>
              <div class="st-roll-item-desc">可手动增删改当前聊天状态。</div>
            </div>
            <div class="st-roll-actions"><button id="${ids.statusEditorOpenId}" type="button" class="st-roll-btn">打开编辑器</button></div>
          </div>

          <div class="st-roll-divider"><i class="fa-solid fa-dice"></i><span>掷骰规则</span><div class="st-roll-divider-line"></div></div>

          ${buildCheckboxItem(
            ids.explodingEnabledId,
            "启用爆骰",
            "满足条件时可追加掷骰。",
            "explode"
          )}

          ${buildCheckboxItem(
            ids.advantageEnabledId,
            "启用优势/劣势",
            "开启后按优势/劣势取高或取低。",
            "advantage disadvantage"
          )}

          ${buildCheckboxItem(
            ids.dynamicResultGuidanceId,
            "启用动态结果引导",
            "掷骰后给 AI 一句结果提示。",
            "dynamic result guidance"
          )}

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="dice sides allowed">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">限制 AI 可用骰子面数</div>
              <div class="st-roll-item-desc">AI 只能用这里列出的骰子面数。</div>
            </div>
            <div class="st-roll-row">
              <input id="${ids.allowedDiceSidesId}" class="st-roll-input" type="text" placeholder="4,6,8,10,12,20,100" />
            </div>
          </div>

          <div class="st-roll-divider"><i class="fa-solid fa-route"></i><span>剧情分支</span><div class="st-roll-divider-line"></div></div>

          ${buildCheckboxItem(
            ids.outcomeBranchesId,
            "启用剧情走向分支",
            "成功、失败、爆骰可走不同后果。",
            "outcome branches"
          )}

          ${buildCheckboxItem(
            ids.explodeOutcomeId,
            "启用爆骰特殊分支",
            "爆骰时使用专用后果文本。",
            "explode outcome branch"
          )}

          ${buildCheckboxItem(
            ids.listOutcomePreviewId,
            "列表卡预览走向",
            "未掷骰时先预览可能结果。",
            "list outcome preview"
          )}

          <div class="st-roll-divider"><i class="fa-solid fa-file-lines"></i><span>摘要注入</span><div class="st-roll-divider-line"></div></div>

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="summary detail mode">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">摘要信息等级</div>
              <div class="st-roll-item-desc">控制发给 AI 的摘要详细度。</div>
            </div>
            <div class="st-roll-row">
              <select id="${ids.summaryDetailId}" class="st-roll-select">
                <option value="minimal">简略</option>
                <option value="balanced">平衡</option>
                <option value="detailed">详细</option>
              </select>
            </div>
          </div>

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="summary rounds history">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">历史轮次数</div>
              <div class="st-roll-item-desc">每次带上最近 N 轮记录。</div>
            </div>
            <div class="st-roll-row"><input id="${ids.summaryRoundsId}" class="st-roll-input" type="number" min="1" max="10" step="1" /></div>
          </div>

          ${buildCheckboxItem(
            ids.includeOutcomeSummaryId,
            "摘要包含走向文本",
            "把本轮结果文本写进摘要。",
            "summary include outcome"
          )}

          <div class="st-roll-divider"><i class="fa-solid fa-stopwatch"></i><span>时限控制</span><div class="st-roll-divider-line"></div></div>

          ${buildCheckboxItem(
            ids.timeLimitEnabledId,
            "启用事件时限",
            "事件有倒计时，超时按失败处理。",
            "time limit timeout"
          )}

          <div id="${ids.timeLimitRowId}" class="st-roll-item st-roll-search-item" data-st-roll-search="minimum time limit seconds">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">最短时限（秒）</div>
              <div class="st-roll-item-desc">AI 给的时限太短时，用这个最小值。</div>
            </div>
            <div class="st-roll-row"><input id="${ids.timeLimitMinId}" class="st-roll-input" type="number" min="1" step="1" /></div>
          </div>

          <div class="st-roll-tip st-roll-search-item" data-st-roll-search="prompt summary status block">
            发送前会自动加入规则、摘要和状态。
          </div>
        </div>

        <div id="${ids.panelSkillId}" class="st-roll-panel" hidden>
          <div class="st-roll-divider"><i class="fa-solid fa-bolt"></i><span>技能系统</span><div class="st-roll-divider-line"></div></div>

          ${buildCheckboxItem(
            ids.skillEnabledId,
            "启用技能系统",
            "关掉后，技能加值不再生效。",
            "skill system enable"
          )}

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="skill editor modal">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">技能编辑器</div>
              <div class="st-roll-item-desc">在这里编辑技能预设和加值。</div>
            </div>
            <div class="st-roll-actions">
              <button id="${ids.skillEditorOpenId}" type="button" class="st-roll-btn">打开编辑器</button>
            </div>
          </div>

          <dialog id="${ids.skillModalId}" class="st-roll-skill-modal">
            <div class="st-roll-skill-modal-backdrop" data-skill-modal-role="backdrop"></div>
            <div class="st-roll-skill-modal-panel">
              <div class="st-roll-skill-modal-head">
                <div class="st-roll-skill-modal-title"><i class="fa-solid fa-bolt"></i><span>技能预设编辑器</span></div>
                <button id="${ids.skillModalCloseId}" type="button" class="st-roll-btn secondary st-roll-skill-modal-close">关闭</button>
              </div>

              <div class="st-roll-skill-modal-body">
                <div id="${ids.skillPresetLayoutId}" class="st-roll-skill-layout">
                  <aside id="${ids.skillPresetSidebarId}" class="st-roll-skill-presets">
                    <div class="st-roll-skill-presets-head">
                      <span class="st-roll-field-label">技能预设</span>
                      <div class="st-roll-actions">
                        <button id="${ids.skillPresetCreateId}" type="button" class="st-roll-btn">新建预设</button>
                        <button id="${ids.skillPresetDeleteId}" type="button" class="st-roll-btn secondary">删除预设</button>
                        <button id="${ids.skillPresetRestoreDefaultId}" type="button" class="st-roll-btn secondary">恢复默认</button>
                      </div>
                    </div>
                    <div id="${ids.skillPresetMetaId}" class="st-roll-skill-preset-meta"></div>
                    <div id="${ids.skillPresetListId}" class="st-roll-skill-preset-list"></div>
                  </aside>

                  <div id="${ids.skillEditorWrapId}" class="st-roll-textarea-wrap">
                    <div class="st-roll-row st-roll-skill-rename-row">
                      <span class="st-roll-field-label">预设名称</span>
                      <input id="${ids.skillPresetNameId}" class="st-roll-input st-roll-skill-preset-name-input" type="text" placeholder="输入预设名称" />
                      <button id="${ids.skillPresetRenameId}" type="button" class="st-roll-btn">保存名称</button>
                    </div>

                    <div class="st-roll-tip">名称必填；加值必须是整数；轮次留空=永久；按技能时要填技能；名称不能重复。</div>
                    <div id="${ids.skillDirtyHintId}" class="st-roll-skill-dirty" hidden>技能改动尚未保存，点击“保存技能表”后生效。</div>
                    <div id="${ids.skillErrorsId}" class="st-roll-skill-errors" hidden></div>

                    <div class="st-roll-skill-head">
                      <span class="st-roll-field-label">技能表（当前预设）</span>
                      <div class="st-roll-actions">
                        <button id="${ids.skillAddId}" type="button" class="st-roll-btn">新增技能</button>
                        <button id="${ids.skillSaveId}" type="button" class="st-roll-btn">保存技能表</button>
                        <button id="${ids.skillResetId}" type="button" class="st-roll-btn secondary">重置为空</button>
                        <button id="${ids.skillImportToggleId}" type="button" class="st-roll-btn secondary">导入 JSON</button>
                        <button id="${ids.skillExportId}" type="button" class="st-roll-btn secondary">导出 JSON</button>
                      </div>
                    </div>

                    <div class="st-roll-skill-cols"><span>技能名</span><span>加值（整数）</span><span>操作</span></div>
                    <div id="${ids.skillRowsId}" class="st-roll-skill-rows"></div>

                    <div id="${ids.skillImportAreaId}" class="st-roll-skill-import" hidden>
                      <div class="st-roll-row" style="margin-bottom:8px;">
                        <span class="st-roll-field-label">粘贴 JSON 后点击应用</span>
                        <div class="st-roll-actions">
                          <button id="${ids.skillImportApplyId}" type="button" class="st-roll-btn">应用导入</button>
                        </div>
                      </div>
                      <textarea id="${ids.skillTextId}" class="st-roll-textarea" rows="7" placeholder='{"察觉":10,"说服":8}'></textarea>
                    </div>
                  </div>
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
                <button id="${ids.ruleSaveId}" type="button" class="st-roll-btn">保存补充</button>
                <button id="${ids.ruleResetId}" type="button" class="st-roll-btn secondary">清空补充</button>
              </div>
            </div>
            <textarea id="${ids.ruleTextId}" class="st-roll-textarea" rows="12" placeholder="只写额外约束，例如：\n1. 场景以潜入风格推进。\n2. outcomes 文本避免重复措辞。\n3. 优势/劣势触发时加强叙事差异。"></textarea>
          </div>
        </div>

        <div id="${ids.panelAboutId}" class="st-roll-panel" hidden>
          <div class="st-roll-divider"><i class="fa-solid fa-circle-info"></i><span>关于插件</span><div class="st-roll-divider-line"></div></div>

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="about version author email github" style="margin-bottom: 12px; align-items: flex-start;">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">${ids.displayName}</div>
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
                  <i class="fa-brands fa-github"></i>
                  <span>GitHub：<a href="${ids.githubUrl}" target="_blank" rel="noopener">${ids.githubText}</a></span>
                </span>
              </div>
            </div>
          </div>

          <div class="st-roll-item st-roll-search-item" style="flex-direction: column; align-items: flex-start; margin-bottom: 12px;" data-st-roll-search="changelog updates history">
            <div class="st-roll-item-title">更新日志 (Changelog)</div>
            <div class="st-roll-changelog">
              ${ids.changelogHtml}
            </div>
          </div>

          <div class="st-roll-item st-roll-search-item" data-st-roll-search="command eventroll roll list help">
            <div class="st-roll-item-main">
              <div class="st-roll-item-title">常用命令</div>
              <div class="st-roll-item-desc">常用命令：/roll 1d20、/eventroll list、/eventroll roll &lt;id&gt;</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!--
    <dialog id="${ids.statusModalId}__legacy_hidden" class="st-roll-status-modal" hidden>
      <div class="st-roll-status-modal-backdrop" data-status-modal-role="backdrop"></div>
      <div class="st-roll-status-modal-panel">
        <div class="st-roll-status-modal-head">
          <div class="st-roll-status-modal-title">
            <i class="fa-solid fa-heart-pulse"></i><span>状态编辑器（当前会话）</span>
          </div>
          <button id="${ids.statusModalCloseId}" type="button" class="st-roll-btn secondary st-roll-status-modal-close">关闭</button>
        </div>
        <div class="st-roll-status-modal-body">
          <div class="st-roll-tip">名称不能为空；修正值必须是整数；范围为“按技能”时，技能列表不能为空；同名状态不能重复。</div>
          <div id="${ids.statusDirtyHintId}" class="st-roll-status-dirty" hidden>状态改动尚未保存，点击“保存状态”后立即生效。</div>
          <div id="${ids.statusErrorsId}" class="st-roll-status-errors" hidden></div>
          <div class="st-roll-status-head">
            <span class="st-roll-field-label">Active_Statuses（会话级）</span>
            <div class="st-roll-actions">
              <button id="${ids.statusAddId}" type="button" class="st-roll-btn">新增状态</button>
              <button id="${ids.statusSaveId}" type="button" class="st-roll-btn">保存状态</button>
              <button id="${ids.statusResetId}" type="button" class="st-roll-btn secondary">重置为空</button>
            </div>
          </div>
          <div class="st-roll-status-cols">
            <span>名称</span><span>修正</span><span>持续轮次</span><span>范围</span><span>技能列表（用 | 分隔）</span><span>启用</span><span>操作</span>
          </div>
          <div id="${ids.statusRowsId}" class="st-roll-status-rows"></div>
        </div>
      </div>
    </dialog>
    -->

    <dialog id="${ids.statusModalId}" class="st-roll-status-modal">
      <div class="st-roll-status-modal-backdrop" data-status-modal-role="backdrop"></div>
      <div class="st-roll-status-modal-panel">
        <div class="st-roll-status-modal-head">
          <div class="st-roll-status-modal-title">
            <i class="fa-solid fa-heart-pulse"></i><span>状态编辑器</span>
          </div>
          <button id="${ids.statusModalCloseId}" type="button" class="st-roll-btn secondary st-roll-status-modal-close">关闭</button>
        </div>
        <div class="st-roll-status-modal-body">
          <div id="${ids.statusLayoutId}" class="st-roll-status-layout">
            <aside id="${ids.statusSidebarId}" class="st-roll-status-sidebar">
              <div class="st-roll-status-sidebar-head">
                <span class="st-roll-field-label">聊天列表</span>
                <span id="${ids.statusMemoryStateId}" class="st-roll-status-memory-state">记忆库：检测中</span>
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
            <section class="st-roll-status-main">
          <div class="st-roll-tip">
                名称必填；修正值要整数；按技能时技能列表不能为空。
              </div>
              <div id="${ids.statusDirtyHintId}" class="st-roll-status-dirty" hidden>当前聊天有未保存修改。</div>
              <div id="${ids.statusErrorsId}" class="st-roll-status-errors" hidden></div>
              <div class="st-roll-status-head">
                <div class="st-roll-status-head-main">
                  <span class="st-roll-field-label">Active_Statuses（按聊天隔离）</span>
                  <div id="${ids.statusChatMetaId}" class="st-roll-status-chat-meta">未选择聊天</div>
                </div>
                <div class="st-roll-actions">
                  <button id="${ids.statusAddId}" type="button" class="st-roll-btn">新增状态</button>
                  <button id="${ids.statusSaveId}" type="button" class="st-roll-btn">保存</button>
                  <button id="${ids.statusResetId}" type="button" class="st-roll-btn secondary">重置</button>
                </div>
              </div>
              <div id="${ids.statusColsId}" class="st-roll-status-cols">
                <span class="st-roll-status-col-head" data-status-col-key="name">名称<div class="st-roll-status-col-resizer" data-status-col-resize-key="name"></div></span>
                <span class="st-roll-status-col-head" data-status-col-key="modifier">修正<div class="st-roll-status-col-resizer" data-status-col-resize-key="modifier"></div></span>
                <span class="st-roll-status-col-head" data-status-col-key="duration">轮次<div class="st-roll-status-col-resizer" data-status-col-resize-key="duration"></div></span>
                <span class="st-roll-status-col-head" data-status-col-key="scope">范围<div class="st-roll-status-col-resizer" data-status-col-resize-key="scope"></div></span>
                <span class="st-roll-status-col-head" data-status-col-key="skills">技能（|）<div class="st-roll-status-col-resizer" data-status-col-resize-key="skills"></div></span>
                <span class="st-roll-status-col-head" data-status-col-key="enabled">启用<div class="st-roll-status-col-resizer" data-status-col-resize-key="enabled"></div></span>
                <span class="st-roll-status-col-head" data-status-col-key="actions">操作</span>
              </div>
              <div id="${ids.statusRowsId}" class="st-roll-status-rows"></div>
            </section>
          </div>
        </div>
      </div>
    </dialog>
  `;
}
