import { ItemView, WorkspaceLeaf, TFile, Notice, moment } from "obsidian";
import type PencilDashboardPlugin from "./main";
import { ensureFonts } from "./fonts";
import {
  getDailyNoteSettings,
  hasDailyNote,
  dailyNotePath,
  collectFavorites,
  buildActivity,
  collectTodos,
  setTodoDone,
  TodoItem,
  DailyNoteSettings,
  FavoriteItem,
  ensureParentFolder,
  formatTodoLine,
  addTodoToNote,
  ACTIVE_HEADING,
  DONE_HEADING,
} from "./data";
import { iconSvg } from "./icons";
import { Background, BACKGROUNDS } from "./backgrounds";

export const VIEW_TYPE_PENCIL_DASHBOARD = "pencil-dashboard-view";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const ACTIVITY_WEEKS = 20;

type CardName = "calendar" | "activity" | "favorites" | "todo";
const ACTIVE_LIMIT = 60;
const DONE_LIMIT = 5;

/** Only shortcuts that do something; "New note" already sits next to the search box. */
const QUICK_ACTIONS: { icon: Parameters<typeof iconSvg>[0]; title: string; command?: string; today?: true }[] = [
  { icon: "folder", title: "Files", command: "file-explorer:open" },
  { icon: "calendar", title: "Today's daily note", today: true },
  { icon: "layout", title: "Canvas", command: "canvas:new-file" },
];

/**
 * Obsidian themes style every <button> (background, text colour, height), which fights the pencil look,
 * so clickable parts are unstyled divs that still behave like buttons for keyboard users.
 */
function pdButton(parent: HTMLElement, info: DomElementInfo): HTMLElement {
  const el = parent.createDiv(info);
  el.addClass("pd-btn");
  if (!el.hasAttribute("role")) el.setAttribute("role", "button");
  el.tabIndex = 0;
  el.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter" || evt.key === " ") {
      evt.preventDefault();
      el.click();
    }
  });
  return el;
}

export class DashboardView extends ItemView {
  private plugin: PencilDashboardPlugin;
  private viewMonth = moment().startOf("month");
  private sortBy: "priority" | "due" = "priority";
  private todos: TodoItem[] = [];
  private refreshHandle: number | null = null;
  private clockHandle: number | null = null;
  private closed = false;
  /** A note this view just wrote; it redraws as soon as Obsidian has re-read it, not after the usual pause. */
  private awaitingIndex: string | null = null;
  /** Vault changes seen while the dashboard was hidden; it redraws once when shown again. */
  private stale = false;
  /**
   * Each card is only rebuilt when what it shows has changed: rebuilding a card makes the browser
   * re-run every pencil filter inside it, which is the expensive part of the dashboard.
   */
  private cards: Partial<Record<CardName, { el: HTMLElement; key: string }>> = {};
  /** The Todo being written survives redraws (every vault change re-renders the whole view). */
  private draft: { text: string; priority: "high" | "medium" | null; due: string | null } = {
    text: "",
    priority: null,
    due: null,
  };

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
    this.applyBackground();
    ensureFonts();
    // While Obsidian is starting it loads and indexes every note (firing create/changed for each);
    // a dashboard restored with the workspace waits for that to finish before reading the vault.
    this.app.workspace.onLayoutReady(() => this.start());
  }

  private async start(): Promise<void> {
    if (this.closed) return;
    await this.render();

    this.clockHandle = window.setInterval(() => {
      if (this.isVisible()) this.renderClock();
    }, 15000);
    this.registerInterval(this.clockHandle);

    // "changed" fires once a note is re-parsed, so a just-added checkbox is already in the cache.
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
    // Coming back to the dashboard tab catches up on whatever changed while it was hidden.
    const catchUp = () => {
      if (!this.stale || !this.isVisible()) return;
      this.stale = false;
      this.render();
    };
    this.registerEvent(this.app.workspace.on("active-leaf-change", catchUp));
    this.registerEvent(this.app.workspace.on("layout-change", catchUp));
    this.registerEvent(this.app.vault.on("create", () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on("delete", () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on("rename", () => this.scheduleRefresh()));
  }

  async onClose(): Promise<void> {
    this.closed = true;
    if (this.refreshHandle) window.clearTimeout(this.refreshHandle);
  }

  applyBackground(): void {
    const current = this.plugin.settings.background;
    this.containerEl.dataset.pdBg = current;
    this.contentEl.querySelectorAll<HTMLElement>(".pd-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.bg === current);
      tab.setAttribute("aria-pressed", String(tab.dataset.bg === current));
    });
  }

  private scheduleRefresh(): void {
    if (this.refreshHandle) window.clearTimeout(this.refreshHandle);
    this.refreshHandle = window.setTimeout(() => {
      this.refreshHandle = null;
      // Typing in a note fires a change every moment; a hidden dashboard only notes it and redraws when shown.
      if (!this.isVisible()) this.stale = true;
      // Redrawing mid-typing would break an IME conversion, so wait until the Todo field is left or emptied.
      else if (this.isWritingTodo()) this.scheduleRefresh();
      else this.render();
    }, 1000);
  }

  private isVisible(): boolean {
    return this.containerEl.isShown();
  }

  private todoInput(): HTMLInputElement | null {
    return this.contentEl.querySelector<HTMLInputElement>(".pd-todo-input");
  }

  private isWritingTodo(): boolean {
    const input = this.todoInput();
    return !!input && input.ownerDocument.activeElement === input && input.value !== "";
  }

  private async render(): Promise<void> {
    this.todos = await collectTodos(this.app);
    this.draw();
  }

  /** Redraws from the Todos already read; right after a write the metadata cache still has the old line numbers. */
  private draw(): void {
    if (!this.cards.todo?.el.isConnected) this.build();

    const settings = getDailyNoteSettings(this.app);
    const today = moment().startOf("day");
    const calendarKey = [
      this.viewMonth.format("YYYY-MM"),
      today.format("YYYY-MM-DD"),
      this.calendarDates()
        .map((d) => (hasDailyNote(this.app, settings, d) ? "1" : "0"))
        .join(""),
    ].join("|");
    this.updateCard("calendar", calendarKey, (card) => this.renderCalendar(card));

    const counts = buildActivity(this.app, ACTIVITY_WEEKS * 7);
    this.updateCard("activity", counts.join(","), (card) => this.renderActivity(card, counts));

    const favs = collectFavorites(this.app);
    this.updateCard("favorites", JSON.stringify(favs), (card) => this.renderFavorites(card, favs));

    const todoKey = JSON.stringify([
      this.sortBy,
      this.draft.priority,
      this.draft.due,
      this.plugin.todoNotePath(),
      this.todos.map((t) => [t.file.path, t.line, t.raw, t.checked]),
    ]);
    const input = this.todoInput();
    const refocusTodo = !!input && input.ownerDocument.activeElement === input;
    this.updateCard("todo", todoKey, (card) => {
      this.renderTodo(card);
      if (refocusTodo) this.todoInput()?.focus();
    });
  }

  private forceRedraw(name: CardName): void {
    const card = this.cards[name];
    if (card) card.key = "!";
  }

  private updateCard(name: CardName, key: string, fill: (card: HTMLElement) => void): void {
    const card = this.cards[name];
    if (!card || card.key === key) return;
    card.el.empty();
    fill(card.el);
    card.key = key;
  }

  /** The parts that never change with the vault: tabs, logo, search, and the empty cards. */
  private build(): void {
    this.contentEl.empty();
    this.contentEl.addClass("pd-surface");
    const root = this.contentEl.createDiv({ cls: "pd-root" });

    root.createDiv({ cls: "pd-tabs", attr: { role: "group", "aria-label": "背景" } }, (tabs) => {
      (Object.entries(BACKGROUNDS) as [Background, string][]).forEach(([value, label], i) => {
        const tab = pdButton(tabs, {
          cls: "pd-tab pd-sk pd-shade",
          text: String(i + 1),
          attr: { title: label, "aria-label": `背景: ${label}`, "data-bg": value },
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

    // A "!" key never matches, so draw() fills every card the first time.
    this.cards = {
      calendar: { el: col1.createDiv({ cls: "pd-card pd-sk" }), key: "!" },
      activity: { el: col2.createDiv({ cls: "pd-card pd-sk" }), key: "!" },
      favorites: { el: col2.createDiv({ cls: "pd-card pd-sk" }), key: "!" },
      todo: { el: grid.createDiv({ cls: "pd-card pd-sk pd-todo" }), key: "!" },
    };
  }

  /** The days shown for `viewMonth`, Monday-first, padded to whole weeks. */
  private calendarDates(): moment.Moment[] {
    const first = this.viewMonth.clone().startOf("month");
    const offset = (first.day() + 6) % 7;
    const cells = Math.ceil((offset + first.daysInMonth()) / 7) * 7;
    const start = first.clone().subtract(offset, "days");
    return Array.from({ length: cells }, (_, i) => start.clone().add(i, "days"));
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
    card.createDiv({
      cls: "pd-date",
      text: now.toDate().toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "long" }),
    });
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

    const newNote = pdButton(searchRow, { cls: "pd-new-note pd-sk pd-shade", text: "＋ New note" });
    newNote.addEventListener("click", () => this.runCommand("file-explorer:new-file"));

    const quick = hero.createDiv({ cls: "pd-quick" });
    for (const action of QUICK_ACTIONS) {
      const btn = pdButton(quick, { cls: "pd-sk pd-shade", attr: { title: action.title } });
      btn.innerHTML = iconSvg(action.icon);
      if (action.today) {
        btn.addEventListener("click", () => this.openOrCreateDailyNote(moment(), getDailyNoteSettings(this.app)));
      } else if (action.command) {
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
    const prev = pdButton(head, { cls: "pd-sk pd-shade", text: "‹" });
    head.createEl("h3", { text: `${MONTHS[this.viewMonth.month()]} ${this.viewMonth.year()}` });
    const next = pdButton(head, { cls: "pd-sk pd-shade", text: "›" });
    prev.addEventListener("click", () => {
      this.viewMonth = this.viewMonth.clone().subtract(1, "month");
      this.draw();
    });
    next.addEventListener("click", () => {
      this.viewMonth = this.viewMonth.clone().add(1, "month");
      this.draw();
    });

    const grid = card.createDiv({ cls: "pd-cal-grid" });
    for (const w of WEEKDAYS) grid.createDiv({ cls: "pd-wd", text: w });

    const settings = getDailyNoteSettings(this.app);
    const today = moment().startOf("day");
    for (const date of this.calendarDates()) {
      const day = pdButton(grid, { cls: "pd-day pd-shade" });
      if (date.month() !== this.viewMonth.month()) day.addClass("out");
      if (date.isSame(today, "day")) day.addClass("today");
      if (hasDailyNote(this.app, settings, date)) day.addClass("has-note");
      day.createSpan({ cls: "pd-n", text: String(date.date()) });
      day.createSpan({ cls: "pd-dot" });
      day.addEventListener("click", () => this.openOrCreateDailyNote(date, settings));
    }
  }

  private async openOrCreateDailyNote(date: moment.Moment, settings: DailyNoteSettings): Promise<void> {
    const path = dailyNotePath(settings, date);
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      const today = moment().startOf("day");
      if (date.isBefore(today, "day")) {
        new Notice("この日のノートはありません");
        return;
      }
      await ensureParentFolder(this.app, path);
      file = await this.app.vault.create(path, await this.dailyNoteContent(settings, date));
    }
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
    }
  }

  /** Fills the daily-notes template with the same {{date}}/{{time}}/{{title}} tokens the core plugin supports. */
  private async dailyNoteContent(settings: DailyNoteSettings, date: moment.Moment): Promise<string> {
    if (!settings.template) return "";
    const templatePath = settings.template.endsWith(".md") ? settings.template : `${settings.template}.md`;
    const template = this.app.vault.getAbstractFileByPath(templatePath);
    if (!(template instanceof TFile)) return "";
    const now = moment();
    return (await this.app.vault.read(template))
      .replace(/{{\s*date\s*:\s*(.+?)\s*}}/gi, (_, fmt: string) => date.format(fmt))
      .replace(/{{\s*time\s*:\s*(.+?)\s*}}/gi, (_, fmt: string) => now.format(fmt))
      .replace(/{{\s*date\s*}}/gi, date.format(settings.format))
      .replace(/{{\s*time\s*}}/gi, now.format("HH:mm"))
      .replace(/{{\s*title\s*}}/gi, date.format(settings.format).split("/").pop() ?? "");
  }

  private renderActivity(card: HTMLElement, counts: number[]): void {
    card.createEl("h2", { text: "Activity" });
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

  private renderFavorites(card: HTMLElement, favs: FavoriteItem[]): void {
    card.createEl("h2", { text: "Favorite" });
    const box = card.createDiv({ cls: "pd-favs" });
    if (favs.length === 0) {
      box.createEl("p", { cls: "pd-muted", text: "コアプラグイン「お気に入り」で登録したノートがここに並びます。" });
      return;
    }
    for (const fav of favs) {
      const btn = pdButton(box, { cls: "pd-fav pd-sk pd-shade" });
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
    const sort = pdButton(head, { cls: "pd-sort pd-sk pd-shade" });
    sort.innerHTML = iconSvg("sort");
    sort.createSpan({ text: this.sortBy === "priority" ? "Priority" : "期日" });
    sort.addEventListener("click", () => {
      this.sortBy = this.sortBy === "priority" ? "due" : "priority";
      this.draw();
    });

    const target = this.plugin.todoNotePath();
    const where = card.createEl("a", {
      cls: "pd-todo-where",
      text: `→ ${target.replace(/\.md$/i, "")}`,
      attr: { title: "Todoノートを開く" },
    });
    where.addEventListener("click", async (evt) => {
      evt.preventDefault();
      const file = this.app.vault.getAbstractFileByPath(target);
      if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
      else new Notice("まだありません。Todoを追加すると作られます");
    });

    const paper = card.createDiv({ cls: "pd-todo-paper" });

    paper.createDiv({ cls: "pd-todo-section", text: ACTIVE_HEADING, attr: { role: "heading", "aria-level": "3" } });
    this.renderTodoForm(paper);
    const priorityRank = (t: TodoItem) => (t.priority === "high" ? 0 : t.priority === "medium" ? 1 : 2);
    const dueRank = (t: TodoItem) => (t.due ? moment(t.due, "YYYY-MM-DD").valueOf() : Infinity);
    const active = this.todos
      .filter((t) => !t.checked)
      .slice(0, ACTIVE_LIMIT)
      .sort((a, b) => (this.sortBy === "priority" ? priorityRank(a) - priorityRank(b) : dueRank(a) - dueRank(b)));
    const activeList = paper.createEl("ul", { cls: "pd-todo-list pd-todo-active" });
    for (const todo of active) this.renderTodoItem(activeList, todo);

    paper.createDiv({ cls: "pd-todo-section", text: DONE_HEADING, attr: { role: "heading", "aria-level": "3" } });
    const doneList = paper.createEl("ul", { cls: "pd-todo-list pd-todo-done" });
    for (const todo of this.todos.filter((t) => t.checked).slice(0, DONE_LIMIT)) this.renderTodoItem(doneList, todo);
  }

  private renderTodoItem(list: HTMLElement, todo: TodoItem): void {
    const li = list.createEl("li");
    if (todo.checked) li.addClass("done");

    const check = pdButton(li, {
      cls: "pd-check pd-sk pd-shade",
      attr: { role: "checkbox", "aria-checked": String(todo.checked) },
    });
    const drawTick = (done: boolean) =>
      (check.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true">${done ? '<path d="M3 11l4.5 5L18 2"/>' : ""}</svg>`);
    drawTick(todo.checked);
    check.addEventListener("click", () => {
      const done = !todo.checked;
      // Tick the box now; the item moves between 進行中 and 完了 once Obsidian has re-read the note.
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
      const view = leaf.view as any;
      view?.editor?.setCursor?.({ line: todo.line, ch: 0 });
    });

    if (todo.checked) return;
    if (todo.priority) {
      li.createSpan({ cls: `pd-tag pd-sk pd-${todo.priority}`, text: todo.priority === "high" ? "High" : "Medium" });
    } else if (todo.due) {
      li.createSpan({ cls: "pd-due", text: this.formatDue(todo.due) });
    }
  }

  private async setDone(todo: TodoItem, done: boolean): Promise<void> {
    this.awaitingIndex = todo.file.path;
    let written = false;
    try {
      written = await setTodoDone(this.app, todo, done, this.plugin.todoNotePath());
    } catch (err) {
      console.error(err);
    }
    if (written) return;
    this.awaitingIndex = null;
    // The box was ticked on screen before the write; the unchanged Todo list must still redraw to undo it.
    this.forceRedraw("todo");
    new Notice("このTodoはノートの中で見つかりませんでした");
    await this.render();
  }

  /** The line under 進行中: write, optionally tag a priority / due date, Enter to add. */
  private renderTodoForm(paper: HTMLElement): void {
    const row = paper.createDiv({ cls: "pd-todo-add" });

    const add = pdButton(row, { cls: "pd-todo-plus", text: "+", attr: { title: "追加", "aria-label": "Todoを追加" } });
    const input = row.createEl("input", {
      cls: "pd-todo-input",
      attr: { type: "text", placeholder: "新しいTodo", "aria-label": "新しいTodo" },
    });
    input.value = this.draft.text;
    input.addEventListener("input", () => (this.draft.text = input.value));
    input.addEventListener("keydown", (evt) => {
      // The Enter that confirms a Japanese IME conversion must not add the Todo.
      if (evt.key !== "Enter" || evt.isComposing || evt.keyCode === 229) return;
      evt.preventDefault();
      this.addTodo();
    });
    add.addEventListener("click", () => (this.draft.text.trim() ? this.addTodo() : input.focus()));

    const priority = this.draft.priority;
    const flag = pdButton(row, {
      cls: `pd-tag pd-sk pd-shade pd-todo-opt${priority ? ` pd-${priority}` : ""}`,
      text: priority === "high" ? "High" : priority === "medium" ? "Medium" : "Priority",
      attr: { title: "優先度（押すたびに High → Medium → なし）" },
    });
    flag.addEventListener("click", () => {
      this.draft.priority = priority === null ? "high" : priority === "high" ? "medium" : null;
      this.draw();
    });

    const due = pdButton(row, { cls: "pd-tag pd-sk pd-shade pd-todo-opt pd-todo-due", attr: { title: "期日" } });
    const dueText = this.draft.due
      ? moment(this.draft.due, "YYYY-MM-DD").toDate().toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" })
      : "期日";
    due.createSpan({ text: dueText });
    if (this.draft.due) due.addClass("is-set");
    // A real date input sits invisibly inside so the system date picker opens on every platform.
    const picker = due.createEl("input", { attr: { type: "date", tabindex: "-1", "aria-hidden": "true" } });
    if (this.draft.due) picker.value = this.draft.due;
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

  private async addTodo(): Promise<void> {
    const text = this.draft.text.trim();
    if (!text) return;
    const path = this.plugin.todoNotePath();
    this.awaitingIndex = path;
    try {
      await addTodoToNote(this.app, path, formatTodoLine(text, this.draft.priority, this.draft.due));
    } catch (err) {
      this.awaitingIndex = null;
      console.error(err);
      new Notice(`Todoを追加できませんでした: ${path}`);
      return;
    }
    this.draft = { text: "", priority: null, due: null };
    this.forceRedraw("todo");
    // The new Todo appears once Obsidian has re-read the note; until then only the field is cleared.
    this.draw();
    this.todoInput()?.focus();
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
