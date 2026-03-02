export function buildRollCommandHelpTemplateEvent(): string {
  return `
      <div>
        通用掷骰命令，支持 <code>NdM[!][khX|klX][+/-B]</code>：
      </div>
      <ul>
        <li><code>/roll</code>（等同于 <code>/roll 1d20</code>）</li>
        <li><code>/roll 1d20</code></li>
        <li><code>/roll 3d6+2</code></li>
        <li><code>/roll 2d10-1</code></li>
        <li><code>/roll 1d6!+2</code>（<code>!</code> 表示爆骰）</li>
        <li><code>/roll 2d20kh1</code>（保留最高 1 个）</li>
        <li><code>/roll 2d20kl1</code>（保留最低 1 个）</li>
      </ul>
      <div>
        结果会保存到 <code>chatMetadata.lastRoll</code>，可通过
        <code>{{lastRoll}}</code> / <code>{{lastRollTotal}}</code> 读取。
      </div>
    `;
}

export function buildEventRollHelpTemplateEvent(): string {
  return `
  <div>
    <div><strong>/eventroll 命令帮助</strong></div>
    <ul>
      <li><code>/eventroll list</code>：列出当前轮次事件</li>
      <li><code>/eventroll roll &lt;eventId&gt;</code>：掷指定事件</li>
      <li><code>/eventroll roll &lt;eventId&gt; &lt;diceExpr&gt;</code>：用自定义骰式覆盖默认骰式</li>
      <li><code>/eventroll help</code>：显示帮助</li>
    </ul>
    <div>
      <strong>rolljson 结果分支（outcomes）</strong>：
      <code>events[i].outcomes.success</code> / <code>failure</code> / <code>explode</code>.
      当 <code>checkDice</code> 含 <code>!</code> 且触发爆骰时，优先使用 <code>explode</code>。
    </div>
    <div>
      <strong>优势 / 劣势</strong>：
      你可以把 <code>events[i].advantageState</code> 设为
      <code>normal</code> / <code>advantage</code> / <code>disadvantage</code>,
      也可以直接在 <code>checkDice</code> 里写保留语法，例如
      <code>2d20kh1</code> / <code>2d20kl1</code>.
      表达式里的保留语法优先级高于 <code>advantageState</code>。
    </div>
    <div>
      <strong>动态规则注入</strong>：
      系统会根据当前设置自动注入可用能力（如爆骰、优势/劣势、走向分支）。
      爆骰与优劣骰会改变判定结果，并通过 <code>outcomes</code> 直接影响剧情走向。
    </div>
    <div>
      <strong>事件目标</strong>：
      可选 <code>events[i].target = { type, name? }</code>，其中
      <code>type</code> 可为 <code>self</code>/<code>scene</code>/<code>supporting</code>/<code>object</code>/<code>other</code>。
    </div>
  </div>`;
}

export function buildPreBlockTemplateEvent(content: string): string {
  return `<pre>${content}</pre>`;
}

export function buildDebugTemplateEvent(content: string): string {
  return `骰子调试模式\n<pre>${content}</pre>`;
}
