import { App, TFile, moment } from "obsidian";

export interface DailyNoteSettings {
  format: string;
  folder: string;
}

/** Reads the core "Daily notes" plugin's format/folder, falling back to its defaults. */
export function getDailyNoteSettings(app: App): DailyNoteSettings {
  // Internal plugins ship no public typings; this mirrors Obsidian's own daily-notes options shape.
  const instance = (app as any).internalPlugins?.getPluginById("daily-notes")?.instance;
  const options = instance?.options ?? {};
  return {
    format: options.format || "YYYY-MM-DD",
    folder: (options.folder || "").replace(/\/$/, ""),
  };
}

export function dailyNotePath(settings: DailyNoteSettings, date: moment.Moment): string {
  const filename = `${date.format(settings.format)}.md`;
  return settings.folder ? `${settings.folder}/${filename}` : filename;
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
