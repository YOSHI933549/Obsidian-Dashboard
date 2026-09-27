var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => PencilDashboardPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/view.ts
var import_obsidian2 = require("obsidian");

// src/data.ts
var import_obsidian = require("obsidian");
function getDailyNoteSettings(app) {
  const instance = app.internalPlugins?.getPluginById("daily-notes")?.instance;
  const options = instance?.options ?? {};
  return {
    format: options.format || "YYYY-MM-DD",
    folder: (options.folder || "").replace(/\/$/, ""),
    template: (options.template || "").trim()
  };
}
function datedNotePath(folder, format, date) {
  const filename = `${date.format(format)}.md`;
  const cleanFolder = folder.trim().replace(/^\/+|\/+$/g, "");
  return cleanFolder ? `${cleanFolder}/${filename}` : filename;
}
function dailyNotePath(settings, date) {
  return datedNotePath(settings.folder, settings.format, date);
}
async function ensureParentFolder(app, path) {
  const parts = path.split("/").slice(0, -1);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current))
      await app.vault.createFolder(current);
  }
}
function hasDailyNote(app, settings, date) {
  return !!app.vault.getAbstractFileByPath(dailyNotePath(settings, date));
}
function collectFavorites(app) {
  const instance = app.internalPlugins?.getPluginById("starred")?.instance;
  const items = instance?.items ?? [];
  return items.filter((it) => it && (it.type === "file" || it.type === "folder")).map((it) => ({
    title: it.title || String(it.path ?? "").split("/").pop()?.replace(/\.md$/, "") || "Untitled",
    path: it.path,
    type: it.type
  }));
}
function buildActivity(app, days) {
  const counts = new Array(days).fill(0);
  const today = (0, import_obsidian.moment)().startOf("day");
  const start = today.clone().subtract(days - 1, "days");
  for (const file of app.vault.getMarkdownFiles()) {
    const diff = (0, import_obsidian.moment)(file.stat.mtime).startOf("day").diff(start, "days");
    if (diff >= 0 && diff < days)
      counts[diff]++;
  }
  return counts;
}
var ACTIVE_HEADING = "\u9032\u884C\u4E2D";
var DONE_HEADING = "\u5B8C\u4E86";
var CHECKBOX_RE = /^(\s*-\s*\[)(.)(\]\s*)(.*)$/;
var PRIORITY_RE = /#(high|medium)\b/i;
var DUE_RE = /📅\s*(\d{4}-\d{2}-\d{2})/;
var HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
var LIST_ITEM_RE = /^(?:[-*+]|\d+[.)])\s/;
async function collectTodos(app) {
  const todos = [];
  const files = app.vault.getMarkdownFiles();
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const taskItems = cache?.listItems?.filter((item) => item.task !== void 0) ?? [];
    if (taskItems.length === 0)
      continue;
    const content = await app.vault.cachedRead(file);
    const lines = content.split("\n");
    for (const item of taskItems) {
      const lineNo = item.position.start.line;
      const raw = lines[lineNo];
      const match = raw ? CHECKBOX_RE.exec(raw) : null;
      if (!match)
        continue;
      let text = match[4];
      const priorityMatch = PRIORITY_RE.exec(text);
      const priority = priorityMatch ? priorityMatch[1].toLowerCase() : null;
      const dueMatch = DUE_RE.exec(text);
      const due = dueMatch ? dueMatch[1] : null;
      text = text.replace(PRIORITY_RE, "").replace(DUE_RE, "").trim();
      if (!text)
        continue;
      todos.push({
        file,
        line: lineNo,
        raw,
        text,
        checked: match[2].toLowerCase() === "x",
        priority,
        due
      });
    }
  }
  todos.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
  return todos;
}
function formatTodoLine(text, priority, due) {
  const parts = [`- [ ] ${text.trim()}`];
  if (priority)
    parts.push(`#${priority}`);
  if (due)
    parts.push(`\u{1F4C5} ${due}`);
  return parts.join(" ");
}
function headingAt(line) {
  const match = HEADING_RE.exec(line);
  return match ? { level: match[1].length, text: match[2] } : null;
}
function findHeading(lines, name) {
  for (let i = 0; i < lines.length; i++) {
    const heading = headingAt(lines[i]);
    if (heading?.text === name)
      return { index: i, level: heading.level };
  }
  return null;
}
function statusHeadingOf(lines, lineNo) {
  let level = 7;
  for (let i = lineNo - 1; i >= 0 && level > 1; i--) {
    const heading = headingAt(lines[i]);
    if (!heading || heading.level >= level)
      continue;
    if (heading.text === ACTIVE_HEADING || heading.text === DONE_HEADING)
      return heading.text;
    level = heading.level;
  }
  return null;
}
function ensureHeading(lines, name) {
  const found = findHeading(lines, name);
  if (found)
    return found.index;
  const other = findHeading(lines, name === ACTIVE_HEADING ? DONE_HEADING : ACTIVE_HEADING);
  const heading = `${"#".repeat(other?.level ?? 2)} ${name}`;
  if (name === ACTIVE_HEADING && other) {
    lines.splice(other.index, 0, heading, "");
    return other.index;
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === "")
    lines.pop();
  if (lines.length > 0)
    lines.push("");
  lines.push(heading, "");
  return lines.length - 2;
}
function topOfSection(lines, headingIndex) {
  let lastText = headingIndex;
  for (let i = headingIndex + 1; i < lines.length; i++) {
    if (headingAt(lines[i]))
      break;
    if (LIST_ITEM_RE.test(lines[i]))
      return i;
    if (lines[i].trim())
      lastText = i;
  }
  return lastText + 1;
}
async function addTodoToNote(app, path, line) {
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof import_obsidian.TFile) {
    await app.vault.process(existing, (content) => {
      const lines = content.split("\n");
      lines.splice(topOfSection(lines, ensureHeading(lines, ACTIVE_HEADING)), 0, line);
      return lines.join("\n");
    });
    return existing;
  }
  await ensureParentFolder(app, path);
  return app.vault.create(path, `## ${ACTIVE_HEADING}
${line}

## ${DONE_HEADING}
`);
}
async function setTodoDone(app, todo, done, todoNotePath) {
  let written = false;
  await app.vault.process(todo.file, (content) => {
    const lines = content.split("\n");
    const at = lines[todo.line] === todo.raw ? todo.line : lines.indexOf(todo.raw);
    const match = at >= 0 ? CHECKBOX_RE.exec(lines[at]) : null;
    if (!match)
      return content;
    const updated = `${match[1]}${done ? "x" : " "}${match[3]}${match[4]}`;
    const target = done ? DONE_HEADING : ACTIVE_HEADING;
    let line = at;
    if (todo.file.path !== todoNotePath || /^\s/.test(updated) || statusHeadingOf(lines, at) === target) {
      lines[at] = updated;
    } else {
      let end = at + 1;
      while (end < lines.length && /^\s+\S/.test(lines[end]))
        end++;
      const block = lines.splice(at, end - at);
      block[0] = updated;
      line = topOfSection(lines, ensureHeading(lines, target));
      lines.splice(line, 0, ...block);
    }
    Object.assign(todo, { line, raw: updated, checked: done });
    written = true;
    return lines.join("\n");
  });
  return written;
}

// src/icons.ts
var ICON_PATHS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  folder: '<path d="M3 7.5V18a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18V9a1.5 1.5 0 0 0-1.5-1.5h-7L10 5H4.5A1.5 1.5 0 0 0 3 6.5z"/>',
  "file-text": '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  pen: '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/><path d="m14.5 5.5 3 3"/>',
  layout: '<rect x="3" y="3" width="7" height="8" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="15" width="7" height="6" rx="1"/>',
  db: '<ellipse cx="12" cy="5.5" rx="8" ry="2.8"/><path d="M4 5.5v13c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8v-13M4 12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5L5 20"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  "file-down": '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6m-2.5-2.5L12 17l2.5-2.5"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  sort: '<path d="M7 4v16M4 7l3-3 3 3M17 20V4m-3 13 3 3 3-3"/>',
  check: '<path d="M3 11l4.5 5L18 2"/>'
};
function iconSvg(name, cls = "pd-ico") {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

// src/backgrounds.ts
var BACKGROUNDS = {
  paper: "\u7D19",
  cork: "\u30B3\u30EB\u30AF\u30DC\u30FC\u30C9"
};

// src/view.ts
var VIEW_TYPE_PENCIL_DASHBOARD = "pencil-dashboard-view";
var MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
var WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
var ACTIVITY_WEEKS = 20;
var ACTIVE_LIMIT = 60;
var DONE_LIMIT = 5;
var QUICK_ACTIONS = [
  { icon: "folder", title: "Files", command: "file-explorer:open" },
  { icon: "file-text", title: "New note", command: "file-explorer:new-file" },
  { icon: "pen", title: "Drawings" },
  { icon: "layout", title: "Canvas", command: "canvas:new-file" },
  { icon: "db", title: "Bases" },
  { icon: "image", title: "Images" },
  { icon: "music", title: "Audio" },
  { icon: "file-down", title: "PDF" },
  { icon: "file", title: "Other files" }
];
function pdButton(parent, info) {
  const el = parent.createDiv(info);
  el.addClass("pd-btn");
  if (!el.hasAttribute("role"))
    el.setAttribute("role", "button");
  el.tabIndex = 0;
  el.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter" || evt.key === " ") {
      evt.preventDefault();
      el.click();
    }
  });
  return el;
}
var DashboardView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.viewMonth = (0, import_obsidian2.moment)().startOf("month");
    this.sortBy = "priority";
    this.todos = [];
    this.refreshHandle = null;
    this.clockHandle = null;
    /** A note this view just wrote; it redraws as soon as Obsidian has re-read it, not after the usual pause. */
    this.awaitingIndex = null;
    /** The Todo being written survives redraws (every vault change re-renders the whole view). */
    this.draft = {
      text: "",
      priority: null,
      due: null
    };
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE_PENCIL_DASHBOARD;
  }
  getDisplayText() {
    return "Dashboard";
  }
  getIcon() {
    return "pencil";
  }
  async onOpen() {
    this.containerEl.addClass("pencil-dashboard-container");
    this.applyBackground();
    await this.render();
    this.clockHandle = window.setInterval(() => this.renderClock(), 15e3);
    this.registerInterval(this.clockHandle);
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (file.path !== this.awaitingIndex || this.isWritingTodo()) {
          this.scheduleRefresh();
        } else {
          this.awaitingIndex = null;
          this.render();
        }
      })
    );
    this.registerEvent(this.app.vault.on("create", () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on("delete", () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on("rename", () => this.scheduleRefresh()));
  }
  async onClose() {
    if (this.refreshHandle)
      window.clearTimeout(this.refreshHandle);
  }
  applyBackground() {
    const current = this.plugin.settings.background;
    this.containerEl.dataset.pdBg = current;
    this.contentEl.querySelectorAll(".pd-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.bg === current);
      tab.setAttribute("aria-pressed", String(tab.dataset.bg === current));
    });
  }
  scheduleRefresh() {
    if (this.refreshHandle)
      window.clearTimeout(this.refreshHandle);
    this.refreshHandle = window.setTimeout(() => {
      if (this.isWritingTodo())
        this.scheduleRefresh();
      else
        this.render();
    }, 700);
  }
  todoInput() {
    return this.contentEl.querySelector(".pd-todo-input");
  }
  isWritingTodo() {
    const input = this.todoInput();
    return !!input && input.ownerDocument.activeElement === input && input.value !== "";
  }
  async render() {
    this.todos = await collectTodos(this.app);
    this.draw();
  }
  /** Redraws from the Todos already read; right after a write the metadata cache still has the old line numbers. */
  draw() {
    const input = this.todoInput();
    const refocusTodo = !!input && input.ownerDocument.activeElement === input;
    this.contentEl.empty();
    this.contentEl.addClass("pd-surface");
    const root = this.contentEl.createDiv({ cls: "pd-root" });
    root.createDiv({ cls: "pd-tabs", attr: { role: "group", "aria-label": "\u80CC\u666F" } }, (tabs) => {
      Object.entries(BACKGROUNDS).forEach(([value, label], i) => {
        const tab = pdButton(tabs, {
          cls: "pd-tab pd-sk pd-shade",
          text: String(i + 1),
          attr: { title: label, "aria-label": `\u80CC\u666F: ${label}`, "data-bg": value }
        });
        tab.addEventListener("click", () => this.plugin.setBackground(value));
      });
    });
    this.applyBackground();
    this.renderHero(root);
    const grid = root.createDiv({ cls: "pd-grid" });
    const col1 = grid.createDiv({ cls: "pd-col" });
    const col2 = grid.createDiv({ cls: "pd-col" });
    col1.createDiv({ cls: "pd-card pd-sk pd-clock", attr: { id: "pd-clock" } });
    this.renderClock();
    this.renderCalendar(col1.createDiv({ cls: "pd-card pd-sk" }));
    this.renderActivity(col2.createDiv({ cls: "pd-card pd-sk" }));
    this.renderFavorites(col2.createDiv({ cls: "pd-card pd-sk" }));
    this.renderTodo(grid.createDiv({ cls: "pd-card pd-sk pd-todo" }));
    if (refocusTodo)
      this.todoInput()?.focus();
  }
  renderClock() {
    const card = this.contentEl.querySelector("#pd-clock");
    if (!card)
      return;
    const now = (0, import_obsidian2.moment)();
    const h = now.hour();
    const greeting = h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    card.empty();
    card.createDiv({ cls: "pd-greet", text: greeting });
    card.createDiv({ cls: "pd-time pd-grain", text: now.format("HH:mm") });
    card.createDiv({
      cls: "pd-date",
      text: now.toDate().toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "long" })
    });
  }
  renderHero(root) {
    const hero = root.createDiv({ cls: "pd-hero" });
    const brand = hero.createDiv({ cls: "pd-brand" });
    brand.innerHTML = '<svg viewBox="0 0 40 46" aria-hidden="true" width="36" height="41"><path d="M21 2 34 12l4 20-12 12-14-5L4 20z" fill="url(#pd-hatch)" stroke="#7b62ad" stroke-width="1.7" stroke-linejoin="round"/><path d="M21 2 17 23l9 21M17 23 4 20M17 23l21 9" fill="none" stroke="#7b62ad" stroke-width="1.1" stroke-linecap="round" opacity="0.75"/></svg>';
    brand.createSpan({ cls: "pd-grain", text: "Obsidian" });
    const searchRow = hero.createDiv({ cls: "pd-search-row" });
    const search = searchRow.createDiv({ cls: "pd-search pd-sk" });
    search.innerHTML = iconSvg("search");
    search.createEl("span", { cls: "pd-search-placeholder", text: "Search or command" });
    search.addEventListener("click", () => this.runCommand("switcher:open"));
    const newNote = pdButton(searchRow, { cls: "pd-new-note pd-sk pd-shade", text: "\uFF0B New note" });
    newNote.addEventListener("click", () => this.runCommand("file-explorer:new-file"));
    const quick = hero.createDiv({ cls: "pd-quick" });
    for (const action of QUICK_ACTIONS) {
      const btn = pdButton(quick, { cls: "pd-sk pd-shade", attr: { title: action.title } });
      btn.innerHTML = iconSvg(action.icon);
      if (action.command) {
        btn.addEventListener("click", () => this.runCommand(action.command));
      }
    }
  }
  runCommand(id) {
    const commands = this.app.commands;
    if (commands?.commands?.[id]) {
      commands.executeCommandById(id);
    } else {
      new import_obsidian2.Notice("\u3053\u306E\u30B3\u30DE\u30F3\u30C9\u306F\u5229\u7528\u3067\u304D\u307E\u305B\u3093");
    }
  }
  renderCalendar(card) {
    card.createEl("h2", { text: "Calendar" });
    const head = card.createDiv({ cls: "pd-cal-head" });
    const prev = pdButton(head, { cls: "pd-sk pd-shade", text: "\u2039" });
    head.createEl("h3", { text: `${MONTHS[this.viewMonth.month()]} ${this.viewMonth.year()}` });
    const next = pdButton(head, { cls: "pd-sk pd-shade", text: "\u203A" });
    prev.addEventListener("click", () => {
      this.viewMonth = this.viewMonth.clone().subtract(1, "month");
      this.draw();
    });
    next.addEventListener("click", () => {
      this.viewMonth = this.viewMonth.clone().add(1, "month");
      this.draw();
    });
    const grid = card.createDiv({ cls: "pd-cal-grid" });
    for (const w of WEEKDAYS)
      grid.createDiv({ cls: "pd-wd", text: w });
    const settings = getDailyNoteSettings(this.app);
    const today = (0, import_obsidian2.moment)().startOf("day");
    const first = this.viewMonth.clone().startOf("month");
    const offset = (first.day() + 6) % 7;
    const daysInMonth = first.daysInMonth();
    const cells = Math.ceil((offset + daysInMonth) / 7) * 7;
    const start = first.clone().subtract(offset, "days");
    for (let i = 0; i < cells; i++) {
      const date = start.clone().add(i, "days");
      const day = pdButton(grid, { cls: "pd-day pd-shade" });
      if (date.month() !== this.viewMonth.month())
        day.addClass("out");
      if (date.isSame(today, "day"))
        day.addClass("today");
      if (hasDailyNote(this.app, settings, date))
        day.addClass("has-note");
      day.createSpan({ cls: "pd-n", text: String(date.date()) });
      day.createSpan({ cls: "pd-dot" });
      day.addEventListener("click", () => this.openOrCreateDailyNote(date, settings));
    }
  }
  async openOrCreateDailyNote(date, settings) {
    const path = dailyNotePath(settings, date);
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian2.TFile)) {
      const today = (0, import_obsidian2.moment)().startOf("day");
      if (date.isBefore(today, "day")) {
        new import_obsidian2.Notice("\u3053\u306E\u65E5\u306E\u30CE\u30FC\u30C8\u306F\u3042\u308A\u307E\u305B\u3093");
        return;
      }
      await ensureParentFolder(this.app, path);
      file = await this.app.vault.create(path, await this.dailyNoteContent(settings, date));
    }
    if (file instanceof import_obsidian2.TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
    }
  }
  /** Fills the daily-notes template with the same {{date}}/{{time}}/{{title}} tokens the core plugin supports. */
  async dailyNoteContent(settings, date) {
    if (!settings.template)
      return "";
    const templatePath = settings.template.endsWith(".md") ? settings.template : `${settings.template}.md`;
    const template = this.app.vault.getAbstractFileByPath(templatePath);
    if (!(template instanceof import_obsidian2.TFile))
      return "";
    const now = (0, import_obsidian2.moment)();
    return (await this.app.vault.read(template)).replace(/{{\s*date\s*:\s*(.+?)\s*}}/gi, (_, fmt) => date.format(fmt)).replace(/{{\s*time\s*:\s*(.+?)\s*}}/gi, (_, fmt) => now.format(fmt)).replace(/{{\s*date\s*}}/gi, date.format(settings.format)).replace(/{{\s*time\s*}}/gi, now.format("HH:mm")).replace(/{{\s*title\s*}}/gi, date.format(settings.format).split("/").pop() ?? "");
  }
  renderActivity(card) {
    card.createEl("h2", { text: "Activity" });
    const days = ACTIVITY_WEEKS * 7;
    const counts = buildActivity(this.app, days);
    const max = Math.max(1, ...counts);
    const heat = card.createDiv({ cls: "pd-heat" });
    for (let col = 0; col < ACTIVITY_WEEKS; col++) {
      for (let row = 0; row < 7; row++) {
        const value = counts[col * 7 + row] ?? 0;
        const level = value === 0 ? 0 : Math.min(4, Math.ceil(value / max * 4));
        heat.createDiv({ cls: level ? `pd-cell pd-l${level}` : "pd-cell" });
      }
    }
    const legend = card.createDiv({ cls: "pd-legend" });
    legend.createSpan({ text: "Less" });
    const sw = legend.createDiv({ cls: "pd-swatches" });
    for (let l = 0; l <= 4; l++)
      sw.createDiv({ cls: l ? `pd-cell pd-l${l}` : "pd-cell" });
    legend.createSpan({ text: "More" });
  }
  renderFavorites(card) {
    card.createEl("h2", { text: "Favorite" });
    const favs = collectFavorites(this.app);
    const box = card.createDiv({ cls: "pd-favs" });
    if (favs.length === 0) {
      box.createEl("p", { cls: "pd-muted", text: "\u30B3\u30A2\u30D7\u30E9\u30B0\u30A4\u30F3\u300C\u304A\u6C17\u306B\u5165\u308A\u300D\u3067\u767B\u9332\u3057\u305F\u30CE\u30FC\u30C8\u304C\u3053\u3053\u306B\u4E26\u3073\u307E\u3059\u3002" });
      return;
    }
    for (const fav of favs) {
      const btn = pdButton(box, { cls: "pd-fav pd-sk pd-shade" });
      btn.innerHTML = iconSvg(fav.type === "folder" ? "folder" : "file-text");
      btn.createSpan({ text: fav.title });
      btn.addEventListener("click", async () => {
        const file = this.app.vault.getAbstractFileByPath(fav.path);
        if (file instanceof import_obsidian2.TFile)
          await this.app.workspace.getLeaf(false).openFile(file);
      });
    }
  }
  renderTodo(card) {
    const head = card.createDiv({ cls: "pd-todo-head" });
    head.createEl("h2", { text: "Todo" });
    const sort = pdButton(head, { cls: "pd-sort pd-sk pd-shade" });
    sort.innerHTML = iconSvg("sort");
    sort.createSpan({ text: this.sortBy === "priority" ? "Priority" : "\u671F\u65E5" });
    sort.addEventListener("click", () => {
      this.sortBy = this.sortBy === "priority" ? "due" : "priority";
      this.draw();
    });
    const target = this.plugin.todoNotePath();
    const where = card.createEl("a", {
      cls: "pd-todo-where",
      text: `\u2192 ${target.replace(/\.md$/i, "")}`,
      attr: { title: "Todo\u30CE\u30FC\u30C8\u3092\u958B\u304F" }
    });
    where.addEventListener("click", async (evt) => {
      evt.preventDefault();
      const file = this.app.vault.getAbstractFileByPath(target);
      if (file instanceof import_obsidian2.TFile)
        await this.app.workspace.getLeaf(false).openFile(file);
      else
        new import_obsidian2.Notice("\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002Todo\u3092\u8FFD\u52A0\u3059\u308B\u3068\u4F5C\u3089\u308C\u307E\u3059");
    });
    const paper = card.createDiv({ cls: "pd-todo-paper" });
    paper.createDiv({ cls: "pd-todo-section", text: ACTIVE_HEADING, attr: { role: "heading", "aria-level": "3" } });
    this.renderTodoForm(paper);
    const priorityRank = (t) => t.priority === "high" ? 0 : t.priority === "medium" ? 1 : 2;
    const dueRank = (t) => t.due ? (0, import_obsidian2.moment)(t.due, "YYYY-MM-DD").valueOf() : Infinity;
    const active = this.todos.filter((t) => !t.checked).slice(0, ACTIVE_LIMIT).sort((a, b) => this.sortBy === "priority" ? priorityRank(a) - priorityRank(b) : dueRank(a) - dueRank(b));
    const activeList = paper.createEl("ul", { cls: "pd-todo-list pd-todo-active" });
    for (const todo of active)
      this.renderTodoItem(activeList, todo);
    paper.createDiv({ cls: "pd-todo-section", text: DONE_HEADING, attr: { role: "heading", "aria-level": "3" } });
    const doneList = paper.createEl("ul", { cls: "pd-todo-list pd-todo-done" });
    for (const todo of this.todos.filter((t) => t.checked).slice(0, DONE_LIMIT))
      this.renderTodoItem(doneList, todo);
  }
  renderTodoItem(list, todo) {
    const li = list.createEl("li");
    if (todo.checked)
      li.addClass("done");
    const check = pdButton(li, {
      cls: "pd-check pd-sk pd-shade",
      attr: { role: "checkbox", "aria-checked": String(todo.checked) }
    });
    const drawTick = (done) => check.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true">${done ? '<path d="M3 11l4.5 5L18 2"/>' : ""}</svg>`;
    drawTick(todo.checked);
    check.addEventListener("click", () => {
      const done = !todo.checked;
      li.toggleClass("done", done);
      check.setAttribute("aria-checked", String(done));
      drawTick(done);
      this.setDone(todo, done);
    });
    const text = li.createEl("a", { cls: "pd-todo-text", text: todo.text || "(no text)" });
    text.addEventListener("click", async (evt) => {
      evt.preventDefault();
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(todo.file);
      const view = leaf.view;
      view?.editor?.setCursor?.({ line: todo.line, ch: 0 });
    });
    if (todo.checked)
      return;
    if (todo.priority) {
      li.createSpan({ cls: `pd-tag pd-sk pd-${todo.priority}`, text: todo.priority === "high" ? "High" : "Medium" });
    } else if (todo.due) {
      li.createSpan({ cls: "pd-due", text: this.formatDue(todo.due) });
    }
  }
  async setDone(todo, done) {
    this.awaitingIndex = todo.file.path;
    let written = false;
    try {
      written = await setTodoDone(this.app, todo, done, this.plugin.todoNotePath());
    } catch (err) {
      console.error(err);
    }
    if (written)
      return;
    this.awaitingIndex = null;
    new import_obsidian2.Notice("\u3053\u306ETodo\u306F\u30CE\u30FC\u30C8\u306E\u4E2D\u3067\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F");
    await this.render();
  }
  /** The line under 進行中: write, optionally tag a priority / due date, Enter to add. */
  renderTodoForm(paper) {
    const row = paper.createDiv({ cls: "pd-todo-add" });
    const add = pdButton(row, { cls: "pd-todo-plus", text: "+", attr: { title: "\u8FFD\u52A0", "aria-label": "Todo\u3092\u8FFD\u52A0" } });
    const input = row.createEl("input", {
      cls: "pd-todo-input",
      attr: { type: "text", placeholder: "\u65B0\u3057\u3044Todo", "aria-label": "\u65B0\u3057\u3044Todo" }
    });
    input.value = this.draft.text;
    input.addEventListener("input", () => this.draft.text = input.value);
    input.addEventListener("keydown", (evt) => {
      if (evt.key !== "Enter" || evt.isComposing || evt.keyCode === 229)
        return;
      evt.preventDefault();
      this.addTodo();
    });
    add.addEventListener("click", () => this.draft.text.trim() ? this.addTodo() : input.focus());
    const priority = this.draft.priority;
    const flag = pdButton(row, {
      cls: `pd-tag pd-sk pd-shade pd-todo-opt${priority ? ` pd-${priority}` : ""}`,
      text: priority === "high" ? "High" : priority === "medium" ? "Medium" : "Priority",
      attr: { title: "\u512A\u5148\u5EA6\uFF08\u62BC\u3059\u305F\u3073\u306B High \u2192 Medium \u2192 \u306A\u3057\uFF09" }
    });
    flag.addEventListener("click", () => {
      this.draft.priority = priority === null ? "high" : priority === "high" ? "medium" : null;
      this.draw();
    });
    const due = pdButton(row, { cls: "pd-tag pd-sk pd-shade pd-todo-opt pd-todo-due", attr: { title: "\u671F\u65E5" } });
    const dueText = this.draft.due ? (0, import_obsidian2.moment)(this.draft.due, "YYYY-MM-DD").toDate().toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" }) : "\u671F\u65E5";
    due.createSpan({ text: dueText });
    if (this.draft.due)
      due.addClass("is-set");
    const picker = due.createEl("input", { attr: { type: "date", tabindex: "-1", "aria-hidden": "true" } });
    if (this.draft.due)
      picker.value = this.draft.due;
    picker.addEventListener("change", () => {
      this.draft.due = picker.value || null;
      this.draw();
    });
    due.addEventListener("click", () => {
      try {
        picker.showPicker();
      } catch {
        picker.focus();
      }
    });
  }
  async addTodo() {
    const text = this.draft.text.trim();
    if (!text)
      return;
    const path = this.plugin.todoNotePath();
    this.awaitingIndex = path;
    try {
      await addTodoToNote(this.app, path, formatTodoLine(text, this.draft.priority, this.draft.due));
    } catch (err) {
      this.awaitingIndex = null;
      console.error(err);
      new import_obsidian2.Notice(`Todo\u3092\u8FFD\u52A0\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F: ${path}`);
      return;
    }
    this.draft = { text: "", priority: null, due: null };
    this.draw();
    this.todoInput()?.focus();
  }
  formatDue(due) {
    const d = (0, import_obsidian2.moment)(due, "YYYY-MM-DD");
    const today = (0, import_obsidian2.moment)().startOf("day");
    const diff = d.diff(today, "days");
    if (diff === 0)
      return "Today";
    if (diff === 1)
      return "Tomorrow";
    if (diff > 1 && diff < 7)
      return d.format("dddd");
    return d.format("MMM D");
  }
};

// src/main.ts
var DEFAULT_SETTINGS = {
  background: "paper",
  todoNote: "Todo.md"
};
var FILTER_HOST_ID = "pencil-dashboard-svg-defs";
function ensureSvgDefs() {
  if (document.getElementById(FILTER_HOST_ID))
    return;
  const host = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  host.setAttribute("id", FILTER_HOST_ID);
  host.setAttribute("aria-hidden", "true");
  host.style.position = "absolute";
  host.style.width = "0";
  host.style.height = "0";
  host.style.overflow = "hidden";
  host.innerHTML = `
    <defs>
      <filter id="pd-pencil" x="-8%" y="-8%" width="116%" height="116%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="warp"/>
        <feDisplacementMap in="SourceGraphic" in2="warp" scale="3" xChannelSelector="R" yChannelSelector="G" result="wobbly"/>
        <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="9" result="noise"/>
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.2 0 0 0 1.75" result="mask"/>
        <feComposite in="wobbly" in2="mask" operator="in"/>
      </filter>
      <filter id="pd-pencil-line" x="-10%" y="-150%" width="120%" height="400%">
        <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="7" result="warp"/>
        <feDisplacementMap in="SourceGraphic" in2="warp" scale="2" xChannelSelector="R" yChannelSelector="G" result="wobbly"/>
        <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="2" result="noise"/>
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2 0 0 0 1.75" result="mask"/>
        <feComposite in="wobbly" in2="mask" operator="in"/>
      </filter>
      <filter id="pd-text" x="-3%" y="-15%" width="106%" height="130%">
        <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="11" result="warp"/>
        <feDisplacementMap in="SourceGraphic" in2="warp" scale="1.2" xChannelSelector="R" yChannelSelector="G" result="wobbly"/>
        <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="4" result="noise"/>
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.3 0 0 0 1.5" result="mask"/>
        <feComposite in="wobbly" in2="mask" operator="in"/>
      </filter>
      <filter id="pd-grain">
        <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="1" seed="5" result="noise"/>
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.6 0 0 0 1.65" result="mask"/>
        <feComposite in="SourceGraphic" in2="mask" operator="in"/>
      </filter>
      <pattern id="pd-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
        <line x1="0" y1="0" x2="0" y2="4" stroke="#7b62ad" stroke-width="1.4" opacity="0.65"/>
      </pattern>
    </defs>`;
  document.body.appendChild(host);
}
var PencilDashboardPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
  }
  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...await this.loadData() };
    ensureSvgDefs();
    this.addSettingTab(new PencilDashboardSettingTab(this.app, this));
    this.addCommand({
      id: "toggle-background",
      name: "\u80CC\u666F\u3092\u5207\u308A\u66FF\u3048\uFF08\u7D19 \u21D4 \u30B3\u30EB\u30AF\u30DC\u30FC\u30C9\uFF09",
      callback: () => this.setBackground(this.settings.background === "paper" ? "cork" : "paper")
    });
    this.registerView(VIEW_TYPE_PENCIL_DASHBOARD, (leaf) => new DashboardView(leaf, this));
    this.addRibbonIcon("pencil", "Open pencil dashboard", () => this.activateView());
    this.addCommand({
      id: "open-pencil-dashboard",
      name: "Open dashboard",
      callback: () => this.activateView()
    });
  }
  onunload() {
    document.getElementById(FILTER_HOST_ID)?.remove();
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  /** The Todo note's vault path; a bare name like "Tasks/Todo" gets its .md added. */
  todoNotePath() {
    const name = this.settings.todoNote.trim().replace(/^\/+|\/+$/g, "") || DEFAULT_SETTINGS.todoNote;
    return /\.md$/i.test(name) ? name : `${name}.md`;
  }
  async setBackground(background) {
    this.settings.background = background;
    await this.saveSettings();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_PENCIL_DASHBOARD)) {
      if (leaf.view instanceof DashboardView)
        leaf.view.applyBackground();
    }
  }
  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_PENCIL_DASHBOARD)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_PENCIL_DASHBOARD, active: true });
    }
    workspace.revealLeaf(leaf);
  }
};
var PencilDashboardSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian3.Setting(containerEl).setName("\u80CC\u666F").setDesc("\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9\u306E\u80CC\u666F\u3092\u9078\u3073\u307E\u3059\u3002").addDropdown((dropdown) => {
      for (const [value, label] of Object.entries(BACKGROUNDS))
        dropdown.addOption(value, label);
      dropdown.setValue(this.plugin.settings.background).onChange((value) => this.plugin.setBackground(value));
    });
    new import_obsidian3.Setting(containerEl).setName("Todo").setHeading();
    new import_obsidian3.Setting(containerEl).setName("Todo\u30CE\u30FC\u30C8").setDesc("\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9\u3067\u8FFD\u52A0\u3057\u305FTodo\u3092\u66F8\u304F\u30CE\u30FC\u30C8\u3002\u300C\u9032\u884C\u4E2D\u300D\u300C\u5B8C\u4E86\u300D\u306E\u898B\u51FA\u3057\u3067\u5206\u3051\u3001\u7121\u3051\u308C\u3070\u81EA\u52D5\u3067\u4F5C\u308A\u307E\u3059\u3002").addText(
      (text) => text.setPlaceholder(DEFAULT_SETTINGS.todoNote).setValue(this.plugin.settings.todoNote).onChange(async (value) => {
        this.plugin.settings.todoNote = value.trim();
        await this.plugin.saveSettings();
      })
    );
  }
};
