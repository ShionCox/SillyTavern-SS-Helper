interface DiceResultTemplateEvent {
  expr: string;
  count: number;
  sides: number;
  modifier: number;
  rolls: number[];
  rawTotal: number;
  total: number;
  exploding?: boolean;
  explosionTriggered?: boolean;
}

function formatModifierTemplateEvent(mod: number): string {
  if (mod === 0) return "0";
  return mod > 0 ? `+${mod}` : `${mod}`;
}

function escapeAttrTemplateEvent(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

function buildDiceComputationTooltipTemplateEvent(result: DiceResultTemplateEvent): string {
  const parts: string[] = [];
  const rollsText = Array.isArray(result.rolls) && result.rolls.length > 0 ? `[${result.rolls.join(", ")}]` : "[]";
  const isD100Composite = Number(result.sides) === 100 && Array.isArray(result.rolls) && result.rolls.length >= 2;
  const rawTotal = Number.isFinite(Number(result.rawTotal)) ? Number(result.rawTotal) : 0;
  const modifier = Number.isFinite(Number(result.modifier)) ? Number(result.modifier) : 0;
  const total = Number.isFinite(Number(result.total)) ? Number(result.total) : rawTotal + modifier;

  if (isD100Composite) {
    const tensValue = Number(result.rolls[0] ?? 0);
    const onesValue = Number(result.rolls[1] ?? 0);
    parts.push(`百分骰 十位=${tensValue} 个位=${onesValue}`);
  } else {
    parts.push(`骰面 ${rollsText}`);
  }
  parts.push(`原始值 ${rawTotal}`);
  parts.push(`修正值 ${formatModifierTemplateEvent(modifier)}`);
  parts.push(`总计 ${total}`);
  if (result.exploding) {
    parts.push(result.explosionTriggered ? "爆骰已触发" : "爆骰已启用");
  }

  return parts.join(" | ");
}

export function buildDiceSvgTemplateEvent(
  value: number,
  sides: number,
  color: string,
  size = 56
): string {
  const stroke = 3;
  const dotR = 4;

  if (sides === 6) {
    const dotsMap: Record<number, number[][]> = {
      1: [[24, 24]],
      2: [[14, 14], [34, 34]],
      3: [[14, 14], [24, 24], [34, 34]],
      4: [[14, 14], [14, 34], [34, 14], [34, 34]],
      5: [[14, 14], [14, 34], [24, 24], [34, 14], [34, 34]],
      6: [[14, 14], [14, 24], [14, 34], [34, 14], [34, 24], [34, 34]],
    };
    const dots = dotsMap[value] || [];
    const circles = dots
      .map(
        ([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${dotR}" fill="${color}" />`
      )
      .join("");

    return `
      <svg width="${size}" height="${size}" viewBox="0 0 48 48" style="display:inline-block; vertical-align: middle;">
          <rect x="4" y="4" width="40" height="40" rx="8" ry="8" fill="none" stroke="${color}" stroke-width="${stroke}" />
          ${circles}
      </svg>`;
  }

  return `
      <svg width="${size}" height="${size}" viewBox="0 0 48 48" style="display:inline-block; vertical-align: middle;">
          <path d="M24 4 L43 14 L43 34 L24 44 L5 34 L5 14 Z" fill="none" stroke="${color}" stroke-width="${stroke}" />
          <path d="M24 4 L24 24 M24 24 L43 34 M24 24 L5 34" stroke="${color}" stroke-width="1.5" opacity="0.6"/>
          <text x="24" y="33" font-size="18" text-anchor="middle" fill="${color}" font-weight="bold" style="font-family: sans-serif;">${value}</text>
      </svg>`;
}

export function buildRollingSvgTemplateEvent(
  color: string,
  cubeSize = 52
): string {
  const halfSize = Math.round(cubeSize / 2);
  const fontSize = Math.max(20, Math.round(cubeSize * 0.42));
  return `
    <div class="cube-scene" style="perspective: 600px; width: ${cubeSize}px; height: ${cubeSize}px;">
      <div class="cube" style="
        width: 100%; height: 100%; position: relative; transform-style: preserve-3d;
      ">
        <div class="cube-face front"  style="position: absolute; width: ${cubeSize}px; height: ${cubeSize}px; border: 2px solid ${color}; background: rgba(43, 29, 29, 0.8); color: ${color}; line-height: ${cubeSize}px; text-align: center; font-weight: bold; font-size: ${fontSize}px; transform: rotateY(  0deg) translateZ(${halfSize}px);">?</div>
        <div class="cube-face back"   style="position: absolute; width: ${cubeSize}px; height: ${cubeSize}px; border: 2px solid ${color}; background: rgba(43, 29, 29, 0.8); color: ${color}; line-height: ${cubeSize}px; text-align: center; font-weight: bold; font-size: ${fontSize}px; transform: rotateY(180deg) translateZ(${halfSize}px);">?</div>
        <div class="cube-face right"  style="position: absolute; width: ${cubeSize}px; height: ${cubeSize}px; border: 2px solid ${color}; background: rgba(43, 29, 29, 0.8); color: ${color}; line-height: ${cubeSize}px; text-align: center; font-weight: bold; font-size: ${fontSize}px; transform: rotateY( 90deg) translateZ(${halfSize}px);">?</div>
        <div class="cube-face left"   style="position: absolute; width: ${cubeSize}px; height: ${cubeSize}px; border: 2px solid ${color}; background: rgba(43, 29, 29, 0.8); color: ${color}; line-height: ${cubeSize}px; text-align: center; font-weight: bold; font-size: ${fontSize}px; transform: rotateY(-90deg) translateZ(${halfSize}px);">?</div>
        <div class="cube-face top"    style="position: absolute; width: ${cubeSize}px; height: ${cubeSize}px; border: 2px solid ${color}; background: rgba(43, 29, 29, 0.8); color: ${color}; line-height: ${cubeSize}px; text-align: center; font-weight: bold; font-size: ${fontSize}px; transform: rotateX( 90deg) translateZ(${halfSize}px);">?</div>
        <div class="cube-face bottom" style="position: absolute; width: ${cubeSize}px; height: ${cubeSize}px; border: 2px solid ${color}; background: rgba(43, 29, 29, 0.8); color: ${color}; line-height: ${cubeSize}px; text-align: center; font-weight: bold; font-size: ${fontSize}px; transform: rotateX(-90deg) translateZ(${halfSize}px);">?</div>
      </div>
    </div>
  `;
}

export function buildResultMessageTemplateEvent(
  result: DiceResultTemplateEvent
): string {
  const modStr = formatModifierTemplateEvent(result.modifier);
  const rollsStr = result.rolls.join(", ");
  const hasModifier = result.modifier !== 0;
  const uniqueId = "d" + Math.random().toString(36).substr(2, 9);

  const rpgColors = {
    border: "#c5a059",
    bg: "linear-gradient(135deg, #2b1d1d 0%, #1a1010 100%)",
    headerBg: "rgba(0, 0, 0, 0.4)",
    textMain: "#e8dcb5",
    textHighlight: "#ffdb78",
    critSuccess: "#4caf50",
    critFail: "#f44336",
  };

  let critType = "normal";
  let critText = "";
  let resultColor = rpgColors.textHighlight;
  let resultGlow = "0 2px 4px rgba(0,0,0,0.5)";
  let cardBg = rpgColors.bg;
  let cardBorder = rpgColors.border;

  if (result.count === 1) {
    const val = result.rolls[0];
    const maxVal = result.sides;
    if (val === maxVal) {
      critType = "success";
      critText = "大成功！";
      resultColor = rpgColors.critSuccess;
      resultGlow = "0 0 15px rgba(76, 175, 80, 0.8)";
      cardBg = "linear-gradient(135deg, #1b3320 0%, #0d1a10 100%)";
      cardBorder = rpgColors.critSuccess;
    } else if (val === 1) {
      critType = "fail";
      critText = "大失败！";
      resultColor = rpgColors.critFail;
      resultGlow = "0 0 15px rgba(244, 67, 54, 0.8)";
      cardBg = "linear-gradient(135deg, #331b1b 0%, #1a0d0d 100%)";
      cardBorder = rpgColors.critFail;
    }
  }

  const showDiceSvgs = result.rolls.length <= 5;
  const diceTooltip = buildDiceComputationTooltipTemplateEvent(result);
  const diceVisuals = showDiceSvgs
    ? result.rolls
        .map((r, idx) => {
          const diceSvg = buildDiceSvgTemplateEvent(r, result.sides, resultColor);
          const singleDiceTooltip = `${diceTooltip} | 第${idx + 1}颗: ${r}`;
          return `<span style="display:inline-flex;cursor:help;" data-tip="${escapeAttrTemplateEvent(singleDiceTooltip)}">${diceSvg}</span>`;
        })
        .join(" ")
    : `<span style="display:inline-flex;cursor:help;" data-tip="${escapeAttrTemplateEvent(diceTooltip)}">${buildDiceSvgTemplateEvent(0, result.sides, resultColor)}</span>`;
  const rollingVisual = buildRollingSvgTemplateEvent(rpgColors.textHighlight);
  const detailParts: string[] = [];
  if (result.rolls.length) {
    detailParts.push(`骰面: [${rollsStr}]`);
  }
  if (hasModifier) {
    detailParts.push(`修正值: ${modStr}`);
  }
  if (result.exploding) {
    detailParts.push(result.explosionTriggered ? "爆骰已触发" : "爆骰已启用");
  }
  const detailText = detailParts.join(" | ");

  return `
  <style>
    @keyframes spin-3d-${uniqueId} {
      0% { transform: rotateX(0deg) rotateY(0deg); }
      100% { transform: rotateX(360deg) rotateY(360deg); }
    }
    @keyframes fade-out-${uniqueId} {
      0% { opacity: 1; }
      90% { opacity: 0; }
      100% { opacity: 0; display: none; }
    }
    @keyframes fade-in-${uniqueId} {
      0% { opacity: 0; transform: scale(0.8); }
      100% { opacity: 1; transform: scale(1); }
    }
    @keyframes pulse-crit-${uniqueId} {
      0% { transform: scale(1); }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); }
    }
    @keyframes shake-crit-${uniqueId} {
      0% { transform: translate(1px, 1px) rotate(0deg); }
      10% { transform: translate(-1px, -2px) rotate(-1deg); }
      20% { transform: translate(-3px, 0px) rotate(1deg); }
      30% { transform: translate(3px, 2px) rotate(0deg); }
      40% { transform: translate(1px, -1px) rotate(1deg); }
      50% { transform: translate(-1px, 2px) rotate(-1deg); }
      60% { transform: translate(-3px, 1px) rotate(0deg); }
      70% { transform: translate(3px, 1px) rotate(-1deg); }
      80% { transform: translate(-1px, -1px) rotate(1deg); }
      90% { transform: translate(1px, 2px) rotate(0deg); }
      100% { transform: translate(1px, -2px) rotate(-1deg); }
    }
    
    .dice-wrapper-${uniqueId} {
      position: relative;
      min-height: 100px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    
    .dice-rolling-${uniqueId} {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      animation: fade-out-${uniqueId} 0.2s forwards 1.2s;
      z-index: 10;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    
    .dice-rolling-${uniqueId} .cube {
      animation: spin-3d-${uniqueId} 1.5s linear infinite;
    }

    .dice-result-${uniqueId} {
      opacity: 0;
      animation: fade-in-${uniqueId} 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards 1.3s;
      text-align: center;
      width: 100%;
    }

    .crit-success-${uniqueId} {
      animation: pulse-crit-${uniqueId} 1s infinite;
      color: ${rpgColors.critSuccess};
      font-weight: bold;
      margin-bottom: 8px;
      text-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
    }

    .crit-fail-${uniqueId} {
      animation: shake-crit-${uniqueId} 0.5s;
      color: ${rpgColors.critFail};
      font-weight: bold;
      margin-bottom: 8px;
      text-shadow: 0 0 10px rgba(244, 67, 54, 0.5);
    }

    .explosion-note-${uniqueId} {
      color: #ffae42;
      font-weight: bold;
      margin-bottom: 8px;
      letter-spacing: 1px;
      text-shadow: 0 0 12px rgba(255, 174, 66, 0.6);
    }
  </style>
  
  <div style="
    border: 2px solid ${cardBorder};
    border-radius: 4px;
    background: ${cardBg};
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5), inset 0 0 30px rgba(0,0,0,0.6);
    font-family: 'Georgia', 'Times New Roman', serif;
    overflow: hidden;
    margin: 8px 0;
    width: 100%;
    box-sizing: border-box;
    color: ${rpgColors.textMain};
    position: relative;
  ">
    <div style="position: absolute; top: 0; left: 0; width: 6px; height: 6px; border-top: 2px solid ${rpgColors.border}; border-left: 2px solid ${rpgColors.border};"></div>
    <div style="position: absolute; top: 0; right: 0; width: 6px; height: 6px; border-top: 2px solid ${rpgColors.border}; border-right: 2px solid ${rpgColors.border};"></div>
    <div style="position: absolute; bottom: 0; left: 0; width: 6px; height: 6px; border-bottom: 2px solid ${rpgColors.border}; border-left: 2px solid ${rpgColors.border};"></div>
    <div style="position: absolute; bottom: 0; right: 0; width: 6px; height: 6px; border-bottom: 2px solid ${rpgColors.border}; border-right: 2px solid ${rpgColors.border};"></div>

    <div style="
        background-color: ${rpgColors.headerBg};
        padding: 8px 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(197, 160, 89, 0.3);
        font-size: 0.9em;
        letter-spacing: 1px;
        text-transform: uppercase;
    ">
        <span style="display: flex; align-items: center; gap: 8px; color: ${rpgColors.textHighlight};">
            <span style="font-weight: bold;">骰子系统</span>
        </span>
        <span style="
            font-family: monospace;
            color: ${rpgColors.textMain};
            background: rgba(0,0,0,0.3);
            padding: 2px 8px;
            border: 1px solid rgba(197, 160, 89, 0.2);
            border-radius: 2px;
            font-size: 0.9em;
        ">${result.expr}</span>
    </div>

    <div class="dice-wrapper-${uniqueId}">
        <div class="dice-rolling-${uniqueId}">
            ${rollingVisual}
        </div>

        <div class="dice-result-${uniqueId}">
            ${critText ? `<div class="${critType === "success" ? `crit-success-${uniqueId}` : `crit-fail-${uniqueId}`}">${critText}</div>` : ""}
          ${result.exploding ? `<div class="explosion-note-${uniqueId}">${result.explosionTriggered ? "连锁爆骰！" : "爆骰已开启"}</div>` : ""}
            
            <div style="margin-bottom: 12px; display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;" data-tip="${escapeAttrTemplateEvent(diceTooltip)}">
                ${diceVisuals}
            </div>

            <div style="
                font-size: 2.5em;
                font-weight: bold;
                color: ${resultColor};
                text-shadow: ${resultGlow};
                line-height: 1;
            ">
                ${result.total}
            </div>
            
            <div style="
                font-size: 0.9em;
                color: ${rpgColors.textMain};
                margin-top: 8px;
                opacity: 0.8;
            ">
              ${detailText}
            </div>
        </div>

    </div>
  </div>
  `;
}

export interface AlreadyRolledDiceVisualTemplateParamsEvent {
  uniqueId: string;
  rollingVisualHtml: string;
  diceVisualsHtml: string;
  critType: "success" | "fail" | "normal";
  critText: string;
  compactMode?: boolean;
}

export function buildAlreadyRolledDiceVisualTemplateEvent(
  params: AlreadyRolledDiceVisualTemplateParamsEvent
): string {
  const compact = params.compactMode === true;
  const wrapperMinHeight = compact ? "92px" : "108px";
  const wrapperPadding = compact ? "8px 0" : "14px 0";
  const wrapperMarginTop = compact ? "0" : "12px";
  const resultWidth = compact ? "auto" : "100%";

  return `
    <style>
      @keyframes spin-3d-${params.uniqueId} {
        0% { transform: rotateX(0deg) rotateY(0deg); }
        100% { transform: rotateX(360deg) rotateY(360deg); }
      }
      @keyframes fade-out-${params.uniqueId} {
        0% { opacity: 1; }
        90% { opacity: 0; }
        100% { opacity: 0; display: none; }
      }
      @keyframes fade-in-${params.uniqueId} {
        0% { opacity: 0; transform: scale(0.8); }
        100% { opacity: 1; transform: scale(1); }
      }
      @keyframes pulse-crit-${params.uniqueId} {
        0% { transform: scale(1); }
        50% { transform: scale(1.1); }
        100% { transform: scale(1); }
      }
      @keyframes shake-crit-${params.uniqueId} {
        0% { transform: translate(1px, 1px) rotate(0deg); }
        10% { transform: translate(-1px, -2px) rotate(-1deg); }
        20% { transform: translate(-3px, 0px) rotate(1deg); }
        30% { transform: translate(3px, 2px) rotate(0deg); }
        40% { transform: translate(1px, -1px) rotate(1deg); }
        50% { transform: translate(-1px, 2px) rotate(-1deg); }
        60% { transform: translate(-3px, 1px) rotate(0deg); }
        70% { transform: translate(3px, 1px) rotate(-1deg); }
        80% { transform: translate(-1px, -1px) rotate(1deg); }
        90% { transform: translate(1px, 2px) rotate(0deg); }
        100% { transform: translate(1px, -2px) rotate(-1deg); }
      }
      
      .dice-wrapper-${params.uniqueId} {
        position: relative;
        min-height: ${wrapperMinHeight};
        padding: ${wrapperPadding};
        margin-top: ${wrapperMarginTop};
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      
      .dice-rolling-${params.uniqueId} {
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        animation: fade-out-${params.uniqueId} 0.2s forwards 1.2s;
        z-index: 10;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      
      .dice-rolling-${params.uniqueId} .cube {
        animation: spin-3d-${params.uniqueId} 1.5s linear infinite;
      }

      .dice-result-${params.uniqueId} {
        opacity: 0;
        animation: fade-in-${params.uniqueId} 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards 1.3s;
        text-align: center;
        width: ${resultWidth};
      }

      .crit-success-${params.uniqueId} {
        animation: pulse-crit-${params.uniqueId} 1s infinite;
        color: #52c41a;
        font-weight: bold;
        margin-bottom: 8px;
        text-shadow: 0 0 10px rgba(82, 196, 26, 0.5);
      }

      .crit-fail-${params.uniqueId} {
        animation: shake-crit-${params.uniqueId} 0.5s;
        color: #ff4d4f;
        font-weight: bold;
        margin-bottom: 8px;
        text-shadow: 0 0 10px rgba(255, 77, 79, 0.5);
      }
    </style>
    
    <div class="dice-wrapper-${params.uniqueId}">
        <div class="dice-rolling-${params.uniqueId}">
            ${params.rollingVisualHtml}
        </div>

        <div class="dice-result-${params.uniqueId}">
            ${params.critText ? `<div class="${params.critType === "success" ? `crit-success-${params.uniqueId}` : `crit-fail-${params.uniqueId}`}">${params.critText}</div>` : ""}
             
            <div style="margin-bottom: 8px; display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;">
                ${params.diceVisualsHtml}
            </div>
        </div>
    </div>
    `;
}
