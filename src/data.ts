import { App, TFile, moment } from "obsidian";

export interface DailyNoteSettings {
  format: string;
  folder: string;
  template: string;
}

/** Reads the core "Daily notes" plugin's format/folder, falling back to its defaults. */
export function getDailyNoteSettings(app: App): DailyNoteSettings {
  // Internal plugins ship no public typings; this mirrors Obsidian's own daily-notes options shape.
  const instance = (app as any).internalPlugins?.getPluginById("daily-notes")?.instance;
  const options = instance?.options ?? {};
  return {
    format: options.format || "YYYY-MM-DD",
    folder: (options.folder || "").replace(/\/$/, ""),
    template: (options.template || "").trim(),
  };
}

/** `folder/<date in format>.md`; a format like `YYYY/MM/YYYY-MM-DD` nests subfolders. */
export function datedNotePath(folder: string, format: string, date: moment.Moment): string {
  const filename = `${date.format(format)}.md`;
  const cleanFolder = folder.trim().replace(/^\/+|\/+$/g, "");
  return cleanFolder ? `${cleanFolder}/${filename}` : filename;
}

export function dailyNotePath(settings: DailyNoteSettings, date: moment.Moment): string {
  return datedNotePath(settings.folder, settings.format, date);
}

/** Creates each missing folder on the way to `path`, since a date format like YYYY/MM/DD nests them. */
export async function ensureParentFolder(app: App, path: string): Promise<void> {
  const parts = path.split("/").slice(0, -1);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
  }
}

export function hasDailyNote(app: App, settings: DailyNoteSettings, date: moment.Moment): boolean {
  return !!app.vault.getAbstractFileByPath(dailyNotePath(settings, date));
}

export interface FavoriteItem {
  title: string;
  path: string;
  type: string;
}

/** Reads the core "Starred" plugin's list, in the order the user arranged it. */
export function collectFavorites(app: App): FavoriteItem[] {
  const instance = (app as any).internalPlugins?.getPluginById("starred")?.instance;
  const items: any[] = instance?.items ?? [];
  return items
    .filter((it) => it && (it.type === "file" || it.type === "folder"))
    .map((it) => ({
      title: it.title || String(it.path ?? "").split("/").pop()?.replace(/\.md$/, "") || "Untitled",
      path: it.path,
      type: it.type,
    }));
}

/** Counts markdown files modified on each of the last `days` days, oldest first. */
export function buildActivity(app: App, days: number): number[] {
  const counts = new Array(days).fill(0);
  const today = moment().startOf("day");
  const start = today.clone().subtract(days - 1, "days");
  for (const file of app.vault.getMarkdownFiles()) {
    const diff = moment(file.stat.mtime).startOf("day").diff(start, "days");
    if (diff >= 0 && diff < days) counts[diff]++;
  }
  return counts;
}

export interface TodoItem {
  file: TFile;
  line: number;
  text: string;
  checked: boolean;
  priority: "high" | "medium" | null;
  due: string | null;
}

const CHECKBOX_RE = /^(\s*-\s*\[)(.)(\]\s*)(.*)$/;
const PRIORITY_RE = /#(high|medium)\b/i;
const DUE_RE = /📅\s*(\d{4}-\d{2}-\d{2})/;

/** Scans every note's cached list items for markdown checkboxes and reads back their raw line. */
export async function collectTodos(app: App, limit: number): Promise<TodoItem[]> {
  const todos: TodoItem[] = [];
  const files = app.vault.getMarkdownFiles();

  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const taskItems = cache?.listItems?.filter((item) => item.task !== undefined) ?? [];
    if (taskItems.length === 0) continue;

    const content = await app.vault.cachedRead(file);
    const lines = content.split("\n");

    for (const item of taskItems) {
      const lineNo = item.position.start.line;
      const raw = lines[lineNo];
      const match = raw ? CHECKBOX_RE.exec(raw) : null;
      if (!match) continue;

      let text = match[4];
      const priorityMatch = PRIORITY_RE.exec(text);
      const priority = priorityMatch ? (priorityMatch[1].toLowerCase() as "high" | "medium") : null;
      const dueMatch = DUE_RE.exec(text);
      const due = dueMatch ? dueMatch[1] : null;
      text = text.replace(PRIORITY_RE, "").replace(DUE_RE, "").trim();
      // Blank checkboxes (e.g. left by a daily-note template) are placeholders, not tasks.
      if (!text) continue;

      todos.push({
        file,
        line: lineNo,
        text,
        checked: match[2].toLowerCase() === "x",
        priority,
        due,
      });
    }
  }

  todos.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
  return todos.slice(0, limit);
}

/** Builds a checkbox line in the same `#high` / `📅 YYYY-MM-DD` syntax collectTodos reads back. */
export function formatTodoLine(text: string, priority: "high" | "medium" | null, due: string | null): string {
  const parts = [`- [ ] ${text.trim()}`];
  if (priority) parts.push(`#${priority}`);
  if (due) parts.push(`📅 ${due}`);
  return parts.join(" ");
}

/** Appends a line to the note at `path`, creating the note and its folders when missing. */
export async function appendLine(app: App, path: string, line: string): Promise<TFile> {
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    await app.vault.process(existing, (content) => {
      const base = content === "" || content.endsWith("\n") ? content : `${content}\n`;
      return `${base}${line}\n`;
    });
    return existing;
  }
  await ensureParentFolder(app, path);
  return app.vault.create(path, `${line}\n`);
}

/** Flips one checkbox in place by rewriting only its line. */
export async function toggleTodo(app: App, todo: TodoItem): Promise<void> {
  await app.vault.process(todo.file, (content) => {
    const lines = content.split("\n");
    const line = lines[todo.line];
    if (!line) return content;
    const match = CHECKBOX_RE.exec(line);
    if (!match) return content;
    const mark = todo.checked ? " " : "x";
    lines[todo.line] = `${match[1]}${mark}${match[3]}${match[4]}`;
    return lines.join("\n");
  });
}
