import fs from "fs";

function normalize(str) {
    return str.replace(/\r\n/g, '\n');
}

const f1 = 'RollHelper/src/settings/uiEvent.ts';
let c1 = normalize(fs.readFileSync(f1, 'utf-8'));

const t1 = normalize(`    const panel = getStatusEditorModalPanelEvent(rowsWrapId);
    if (!panel) return;
    event.preventDefault();
    splitter.classList.add("is-resizing");

    const startX = event.clientX;
    const startWidth = Number.parseFloat(getComputedStyle(panel).getPropertyValue("--st-roll-status-sidebar-width")) || 300;`);

const r1 = normalize(`    const panel = getStatusEditorModalPanelEvent(rowsWrapId);
    if (!panel) return;
    event.preventDefault();
    event.stopPropagation();
    splitter.classList.add("is-resizing");

    const startX = event.clientX;
    const sidebar = splitter.previousElementSibling as HTMLElement | null;
    const startWidth = Math.max(220, Math.round(sidebar?.getBoundingClientRect().width ?? 300));`);

if (c1.includes(t1)) {
    c1 = c1.replace(t1, r1);
    fs.writeFileSync(f1, c1, 'utf-8');
    console.log("uiEvent.ts replaced successfully.");
} else {
    console.log("uiEvent.ts target not found!");
}

const f2 = 'RollHelper/src/templates/settingsCardStylesTemplate.ts';
let c2 = normalize(fs.readFileSync(f2, 'utf-8'));

const t2 = normalize(`    #\${cardId} .st-roll-status-splitter {
      cursor: col-resize;
      background: rgba(255, 255, 255, 0.04);`);

const r2 = normalize(`    #\${cardId} .st-roll-status-splitter {
      cursor: col-resize;
      user-select: none;
      background: rgba(255, 255, 255, 0.04);`);

if (c2.includes(t2)) {
    c2 = c2.replace(t2, r2);
    fs.writeFileSync(f2, c2, 'utf-8');
    console.log("settingsCardStylesTemplate target 1 replaced!");
} else {
    console.log("settingsCardStylesTemplate target 1 not found!");
}

c2 = normalize(fs.readFileSync(f2, 'utf-8'));
const t3 = normalize(`    #\${cardId} .st-roll-status-splitter {
      background: var(--st-roll-panel-muted-bg);
      border-left-color: var(--st-roll-content-border);`);

const r3 = normalize(`    #\${cardId} .st-roll-status-splitter {
      user-select: none;
      background: var(--st-roll-panel-muted-bg);
      border-left-color: var(--st-roll-content-border);`);

if (c2.includes(t3)) {
    c2 = c2.replace(t3, r3);
    fs.writeFileSync(f2, c2, 'utf-8');
    console.log("settingsCardStylesTemplate target 2 replaced!");
} else {
    console.log("settingsCardStylesTemplate target 2 not found!");
}
