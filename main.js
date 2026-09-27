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
    folder: (options.folder || "").replace(/\/$/, "")
  };
}
function dailyNotePath(settings, date) {
  const filename = `${date.format(settings.format)}.md`;
  return settings.folder ? `${settings.folder}/${filename}` : filename;
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
var CHECKBOX_RE = /^(\s*-\s*\[)(.)(\]\s*)(.*)$/;
var PRIORITY_RE = /#(high|medium)\b/i;
var DUE_RE = /📅\s*(\d{4}-\d{2}-\d{2})/;
async function collectTodos(app, limit) {
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
      todos.push({
        file,
        line: lineNo,
        text,
        checked: match[2].toLowerCase() === "x",
        priority,
        due
      });
    }
  }
  todos.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
  return todos.slice(0, limit);
}
async function toggleTodo(app, todo) {
  await app.vault.process(todo.file, (content) => {
    const lines = content.split("\n");
    const line = lines[todo.line];
    if (!line)
      return content;
    const match = CHECKBOX_RE.exec(line);
    if (!match)
      return content;
    const mark = todo.checked ? " " : "x";
    lines[todo.line] = `${match[1]}${mark}${match[3]}${match[4]}`;
    return lines.join("\n");
  });
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
var TODO_LIMIT = 60;
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
var DashboardView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.viewMonth = (0, import_obsidian2.moment)().startOf("month");
    this.sortBy = "priority";
    this.todos = [];
    this.refreshHandle = null;
    this.clockHandle = null;
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
    await this.render();
    this.clockHandle = window.setInterval(() => this.renderClock(), 15e3);
    this.registerInterval(this.clockHandle);
    this.registerEvent(this.app.vault.on("modify", () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on("create", () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on("delete", () => this.scheduleRefresh()));
  }
  async onClose() {
    if (this.refreshHandle)
      window.clearTimeout(this.refreshHandle);
  }
  scheduleRefresh() {
    if (this.refreshHandle)
      window.clearTimeout(this.refreshHandle);
    this.refreshHandle = window.setTimeout(() => this.render(), 700);
  }
  async render() {
    this.todos = await collectTodos(this.app, TODO_LIMIT);
    this.contentEl.empty();
    this.contentEl.addClass("pd-surface");
    const root = this.contentEl.createDiv({ cls: "pd-root" });
    root.createDiv({ cls: "pd-tabs" }, (tabs) => {
      [1, 2, 3].forEach((n) => {
        const tab = tabs.createEl("button", { cls: "pd-tab pd-sk pd-shade", text: String(n) });
        if (n === 1)
          tab.addClass("active");
        tab.addEventListener("click", () => {
          tabs.querySelectorAll(".pd-tab").forEach((t) => t.removeClass("active"));
          tab.addClass("active");
        });
      });
      tabs.createEl("button", { cls: "pd-tab pd-sk pd-shade", attr: { "aria-label": "Add dashboard" } });
    });
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
    const newNote = searchRow.createEl("button", { cls: "pd-new-note pd-sk pd-shade", text: "\uFF0B New note" });
    newNote.addEventListener("click", () => this.runCommand("file-explorer:new-file"));
    const quick = hero.createDiv({ cls: "pd-quick" });
    for (const action of QUICK_ACTIONS) {
      const btn = quick.createEl("button", { cls: "pd-sk pd-shade", attr: { title: action.title } });
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
    const prev = head.createEl("button", { cls: "pd-sk pd-shade", text: "\u2039" });
    head.createEl("h3", { text: `${MONTHS[this.viewMonth.month()]} ${this.viewMonth.year()}` });
    const next = head.createEl("button", { cls: "pd-sk pd-shade", text: "\u203A" });
    prev.addEventListener("click", () => {
      this.viewMonth = this.viewMonth.clone().subtract(1, "month");
      this.render();
    });
    next.addEventListener("click", () => {
      this.viewMonth = this.viewMonth.clone().add(1, "month");
      this.render();
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
      const day = grid.createEl("button", { cls: "pd-day pd-shade" });
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
      if (settings.folder && !this.app.vault.getAbstractFileByPath(settings.folder)) {
        await this.app.vault.createFolder(settings.folder).catch(() => void 0);
      }
      file = await this.app.vault.create(path, `# ${date.format("YYYY-MM-DD")}
`);
    }
    if (file instanceof import_obsidian2.TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
    }
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
      const btn = box.createEl("button", { cls: "pd-fav pd-sk pd-shade" });
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
    const sort = head.createEl("button", { cls: "pd-sort pd-sk pd-shade" });
    sort.innerHTML = iconSvg("sort");
    sort.createSpan({ text: this.sortBy === "priority" ? "Priority" : "Due" });
    sort.addEventListener("click", () => {
      this.sortBy = this.sortBy === "priority" ? "due" : "priority";
      this.render();
    });
    const list = card.createEl("ul", { cls: "pd-todo-list" });
    if (this.todos.length === 0) {
      list.createEl("li", { cls: "pd-muted", text: "\u30C1\u30A7\u30C3\u30AF\u30DC\u30C3\u30AF\u30B9\uFF08- [ ]\uFF09\u3092\u542B\u3080\u30CE\u30FC\u30C8\u304C\u3053\u3053\u306B\u4E26\u3073\u307E\u3059\u3002" });
      return;
    }
    const priorityRank = (t) => t.priority === "high" ? 0 : t.priority === "medium" ? 1 : 2;
    const dueRank = (t) => t.due ? (0, import_obsidian2.moment)(t.due, "YYYY-MM-DD").valueOf() : Infinity;
    const sorted = [...this.todos].sort(
      (a, b) => this.sortBy === "priority" ? priorityRank(a) - priorityRank(b) : dueRank(a) - dueRank(b)
    );
    for (const todo of sorted) {
      const li = list.createEl("li");
      if (todo.checked)
        li.addClass("done");
      const check = li.createEl("button", {
        cls: "pd-check pd-sk pd-shade",
        attr: { role: "checkbox", "aria-checked": String(todo.checked) }
      });
      check.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true">${todo.checked ? '<path d="M3 11l4.5 5L18 2"/>' : ""}</svg>`;
      check.addEventListener("click", async () => {
        await toggleTodo(this.app, todo);
        await this.render();
      });
      const text = li.createEl("a", { cls: "pd-todo-text", text: todo.text || "(no text)" });
      text.addEventListener("click", async (evt) => {
        evt.preventDefault();
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(todo.file);
        const view = leaf.view;
        view?.editor?.setCursor?.({ line: todo.line, ch: 0 });
      });
      if (todo.priority) {
        li.createSpan({ cls: `pd-tag pd-sk pd-${todo.priority}`, text: todo.priority === "high" ? "High" : "Medium" });
      } else if (todo.due) {
        li.createSpan({ cls: "pd-due", text: this.formatDue(todo.due) });
      }
    }
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
  async onload() {
    ensureSvgDefs();
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
