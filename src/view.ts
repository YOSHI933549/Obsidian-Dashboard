import { ItemView, WorkspaceLeaf, TFile, Notice, moment } from "obsidian";
import type PencilDashboardPlugin from "./main";
import {
  getDailyNoteSettings,
  hasDailyNote,
  dailyNotePath,
  collectFavorites,
  buildActivity,
  collectTodos,
  toggleTodo,
  TodoItem,
} from "./data";
import { iconSvg } from "./icons";

export const VIEW_TYPE_PENCIL_DASHBOARD = "pencil-dashboard-view";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const ACTIVITY_WEEKS = 20;
const TODO_LIMIT = 60;

const QUICK_ACTIONS: { icon: Parameters<typeof iconSvg>[0]; title: string; command?: string }[] = [
  { icon: "folder", title: "Files", command: "file-explorer:open" },
  { icon: "file-text", title: "New note", command: "file-explorer:new-file" },
  { icon: "pen", title: "Drawings" },
  { icon: "layout", title: "Canvas", command: "canvas:new-file" },
  { icon: "db", title: "Bases" },
  { icon: "image", title: "Images" },
  { icon: "music", title: "Audio" },
  { icon: "file-down", title: "PDF" },
  { icon: "file", title: "Other files" },
];

export class DashboardView extends ItemView {
  private plugin: PencilDashboardPlugin;
  private viewMonth = moment().startOf("month");
  private sortBy: "priority" | "due" = "priority";
  private todos: TodoItem[] = [];
  private refreshHandle: number | null = null;
  private clockHandle: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: PencilDashboardPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_PENCIL_DASHBOARD;
  }

  getDisplayText(): string {
    return "Dashboard";
  }

  getIcon(): string {
    return "pencil";
  }

  async onOpen(): Promise<void> {
    this.containerEl.addClass("pencil-dashboard-container");
    await this.render();

    this.clockHandle = window.setInterval(() => this.renderClock(), 15000);
    this.registerInterval(this.clockHandle);

    this.registerEvent(this.app.vault.on("modify", () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on("create", () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on("delete", () => this.scheduleRefresh()));
  }

  async onClose(): Promise<void> {
    if (this.refreshHandle) window.clearTimeout(this.refreshHandle);
  }

  private scheduleRefresh(): void {
    if (this.refreshHandle) window.clearTimeout(this.refreshHandle);
    this.refreshHandle = window.setTimeout(() => this.render(), 700);
  }

  private async render(): Promise<void> {
    this.todos = await collectTodos(this.app, TODO_LIMIT);

    const root = this.contentEl;
    root.empty();
    root.addClass("pd-root");

    root.createDiv({ cls: "pd-tabs" }, (tabs) => {
      [1, 2, 3].forEach((n) => {
        const tab = tabs.createEl("button", { cls: "pd-tab pd-sk pd-shade", text: String(n) });
        if (n === 1) tab.addClass("active");
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

  private renderClock(): void {
    const card = this.contentEl.querySelector("#pd-clock");
    if (!card) return;
    const now = moment();
    const h = now.hour();
    const greeting = h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    card.empty();
    card.createDiv({ cls: "pd-greet", text: greeting });
    card.createDiv({ cls: "pd-time pd-grain", text: now.format("HH:mm") });
    card.createDiv({ cls: "pd-date", text: now.format("M月D日dddd") });
  }

  private renderHero(root: HTMLElement): void {
    const hero = root.createDiv({ cls: "pd-hero" });
    const brand = hero.createDiv({ cls: "pd-brand" });
    brand.innerHTML =
      '<svg viewBox="0 0 40 46" aria-hidden="true" width="36" height="41">' +
      '<path d="M21 2 34 12l4 20-12 12-14-5L4 20z" fill="url(#pd-hatch)" stroke="#7b62ad" stroke-width="1.7" stroke-linejoin="round"/>' +
      '<path d="M21 2 17 23l9 21M17 23 4 20M17 23l21 9" fill="none" stroke="#7b62ad" stroke-width="1.1" stroke-linecap="round" opacity="0.75"/>' +
      "</svg>";
    brand.createSpan({ cls: "pd-grain", text: "Obsidian" });

    const searchRow = hero.createDiv({ cls: "pd-search-row" });
    const search = searchRow.createDiv({ cls: "pd-search pd-sk" });
    search.innerHTML = iconSvg("search");
    search.createEl("span", { cls: "pd-search-placeholder", text: "Search or command" });
    search.addEventListener("click", () => this.runCommand("switcher:open"));

    const newNote = searchRow.createEl("button", { cls: "pd-new-note pd-sk pd-shade", text: "＋ New note" });
    newNote.addEventListener("click", () => this.runCommand("file-explorer:new-file"));

    const quick = hero.createDiv({ cls: "pd-quick" });
    for (const action of QUICK_ACTIONS) {
      const btn = quick.createEl("button", { cls: "pd-sk pd-shade", attr: { title: action.title } });
      btn.innerHTML = iconSvg(action.icon);
      if (action.command) {
        btn.addEventListener("click", () => this.runCommand(action.command as string));
      }
    }
  }

  private runCommand(id: string): void {
    const commands = (this.app as any).commands;
    if (commands?.commands?.[id]) {
      commands.executeCommandById(id);
    } else {
      new Notice("このコマンドは利用できません");
    }
  }

  private renderCalendar(card: HTMLElement): void {
    card.createEl("h2", { text: "Calendar" });
    const head = card.createDiv({ cls: "pd-cal-head" });
    const prev = head.createEl("button", { cls: "pd-sk pd-shade", text: "‹" });
    head.createEl("h3", { text: `${MONTHS[this.viewMonth.month()]} ${this.viewMonth.year()}` });
    const next = head.createEl("button", { cls: "pd-sk pd-shade", text: "›" });
    prev.addEventListener("click", () => {
      this.viewMonth = this.viewMonth.clone().subtract(1, "month");
      this.render();
    });
    next.addEventListener("click", () => {
      this.viewMonth = this.viewMonth.clone().add(1, "month");
      this.render();
    });

    const grid = card.createDiv({ cls: "pd-cal-grid" });
    for (const w of WEEKDAYS) grid.createDiv({ cls: "pd-wd", text: w });

    const settings = getDailyNoteSettings(this.app);
    const today = moment().startOf("day");
    const first = this.viewMonth.clone().startOf("month");
    const offset = (first.day() + 6) % 7;
    const daysInMonth = first.daysInMonth();
    const cells = Math.ceil((offset + daysInMonth) / 7) * 7;
    const start = first.clone().subtract(offset, "days");

    for (let i = 0; i < cells; i++) {
      const date = start.clone().add(i, "days");
      const day = grid.createEl("button", { cls: "pd-day pd-shade" });
      if (date.month() !== this.viewMonth.month()) day.addClass("out");
      if (date.isSame(today, "day")) day.addClass("today");
      if (hasDailyNote(this.app, settings, date)) day.addClass("has-note");
      day.createSpan({ cls: "pd-n", text: String(date.date()) });
      day.createSpan({ cls: "pd-dot" });
      day.addEventListener("click", () => this.openOrCreateDailyNote(date, settings));
    }
  }

  private async openOrCreateDailyNote(date: moment.Moment, settings: ReturnType<typeof getDailyNoteSettings>): Promise<void> {
    const path = dailyNotePath(settings, date);
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      const today = moment().startOf("day");
      if (date.isBefore(today, "day")) {
        new Notice("この日のノートはありません");
        return;
      }
      if (settings.folder && !this.app.vault.getAbstractFileByPath(settings.folder)) {
        await this.app.vault.createFolder(settings.folder).catch(() => undefined);
      }
      file = await this.app.vault.create(path, `# ${date.format("YYYY-MM-DD")}\n`);
    }
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
    }
  }

  private renderActivity(card: HTMLElement): void {
    card.createEl("h2", { text: "Activity" });
    const days = ACTIVITY_WEEKS * 7;
    const counts = buildActivity(this.app, days);
    const max = Math.max(1, ...counts);

    const heat = card.createDiv({ cls: "pd-heat" });
    for (let col = 0; col < ACTIVITY_WEEKS; col++) {
      for (let row = 0; row < 7; row++) {
        const value = counts[col * 7 + row] ?? 0;
        const level = value === 0 ? 0 : Math.min(4, Math.ceil((value / max) * 4));
        heat.createDiv({ cls: level ? `pd-cell pd-l${level}` : "pd-cell" });
      }
    }

    const legend = card.createDiv({ cls: "pd-legend" });
    legend.createSpan({ text: "Less" });
    const sw = legend.createDiv({ cls: "pd-swatches" });
    for (let l = 0; l <= 4; l++) sw.createDiv({ cls: l ? `pd-cell pd-l${l}` : "pd-cell" });
    legend.createSpan({ text: "More" });
  }

  private renderFavorites(card: HTMLElement): void {
    card.createEl("h2", { text: "Favorite" });
    const favs = collectFavorites(this.app);
    const box = card.createDiv({ cls: "pd-favs" });
    if (favs.length === 0) {
      box.createEl("p", { cls: "pd-muted", text: "コアプラグイン「お気に入り」で登録したノートがここに並びます。" });
      return;
    }
    for (const fav of favs) {
      const btn = box.createEl("button", { cls: "pd-fav pd-sk pd-shade" });
      btn.innerHTML = iconSvg(fav.type === "folder" ? "folder" : "file-text");
      btn.createSpan({ text: fav.title });
      btn.addEventListener("click", async () => {
        const file = this.app.vault.getAbstractFileByPath(fav.path);
        if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
      });
    }
  }

  private renderTodo(card: HTMLElement): void {
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
      list.createEl("li", { cls: "pd-muted", text: "チェックボックス（- [ ]）を含むノートがここに並びます。" });
      return;
    }

    const priorityRank = (t: TodoItem) => (t.priority === "high" ? 0 : t.priority === "medium" ? 1 : 2);
    const dueRank = (t: TodoItem) => (t.due ? moment(t.due, "YYYY-MM-DD").valueOf() : Infinity);
    const sorted = [...this.todos].sort((a, b) =>
      this.sortBy === "priority" ? priorityRank(a) - priorityRank(b) : dueRank(a) - dueRank(b)
    );

    for (const todo of sorted) {
      const li = list.createEl("li");
      if (todo.checked) li.addClass("done");

      const check = li.createEl("button", {
        cls: "pd-check pd-sk pd-shade",
        attr: { role: "checkbox", "aria-checked": String(todo.checked) },
      });
      check.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true">${
        todo.checked ? '<path d="M3 11l4.5 5L18 2"/>' : ""
      }</svg>`;
      check.addEventListener("click", async () => {
        await toggleTodo(this.app, todo);
        await this.render();
      });

      const text = li.createEl("a", { cls: "pd-todo-text", text: todo.text || "(no text)" });
      text.addEventListener("click", async (evt) => {
        evt.preventDefault();
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(todo.file);
        const view = leaf.view as any;
        view?.editor?.setCursor?.({ line: todo.line, ch: 0 });
      });

      if (todo.priority) {
        li.createSpan({ cls: `pd-tag pd-sk pd-${todo.priority}`, text: todo.priority === "high" ? "High" : "Medium" });
      } else if (todo.due) {
        li.createSpan({ cls: "pd-due", text: this.formatDue(todo.due) });
      }
    }
  }

  private formatDue(due: string): string {
    const d = moment(due, "YYYY-MM-DD");
    const today = moment().startOf("day");
    const diff = d.diff(today, "days");
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff > 1 && diff < 7) return d.format("dddd");
    return d.format("MMM D");
  }
}
