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

/** Fills the daily-notes template with the same {{date}}/{{time}}/{{title}} tokens the core plugin supports. */
export async function dailyNoteContent(app: App, settings: DailyNoteSettings, date: moment.Moment): Promise<string> {
  if (!settings.template) return "";
  const templatePath = settings.template.endsWith(".md") ? settings.template : `${settings.template}.md`;
  const template = app.vault.getAbstractFileByPath(templatePath);
  if (!(template instanceof TFile)) return "";
  const now = moment();
  return (await app.vault.read(template))
    .replace(/{{\s*date\s*:\s*(.+?)\s*}}/gi, (_, fmt: string) => date.format(fmt))
    .replace(/{{\s*time\s*:\s*(.+?)\s*}}/gi, (_, fmt: string) => now.format(fmt))
    .replace(/{{\s*date\s*}}/gi, date.format(settings.format))
    .replace(/{{\s*time\s*}}/gi, now.format("HH:mm"))
    .replace(/{{\s*title\s*}}/gi, date.format(settings.format).split("/").pop() ?? "");
}

/** Adds `text` as a bullet at the end of today's daily note, creating the note (from its template) if needed. */
export async function appendToDailyNote(app: App, text: string): Promise<TFile> {
  const settings = getDailyNoteSettings(app);
  const today = moment();
  const path = dailyNotePath(settings, today);
  let file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) {
    await ensureParentFolder(app, path);
    file = await app.vault.create(path, await dailyNoteContent(app, settings, today));
  }
  const note = file as TFile;
  await app.vault.process(note, (content) => {
    const body = content.replace(/\s+$/, "");
    const bullet = `- ${text}`;
    if (!body) return `${bullet}\n`;
    // Consecutive captures stay one list; after other text, a blank line starts a new one.
    const lastLine = body.slice(body.lastIndexOf("\n") + 1);
    return /^\s*[-*+] /.test(lastLine) ? `${body}\n${bullet}\n` : `${body}\n\n${bullet}\n`;
  });
  return note;
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
  /** The whole line as read, so it can be found again after lines above it move. */
  raw: string;
  text: string;
  checked: boolean;
  priority: "high" | "medium" | null;
  due: string | null;
}

/** The two headings the Todo note is split into. */
export const ACTIVE_HEADING = "進行中";
export const DONE_HEADING = "完了";

const CHECKBOX_RE = /^(\s*-\s*\[)(.)(\]\s*)(.*)$/;
const PRIORITY_RE = /#(high|medium)\b/i;
const DUE_RE = /📅\s*(\d{4}-\d{2}-\d{2})/;
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const LIST_ITEM_RE = /^(?:[-*+]|\d+[.)])\s/;

/** Every note's checkboxes, most recently modified notes first and in line order within a note. */
export async function collectTodos(app: App): Promise<TodoItem[]> {
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
        raw,
        text,
        checked: match[2].toLowerCase() === "x",
        priority,
        due,
      });
    }
  }

  todos.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
  return todos;
}

/** Builds a checkbox line in the same `#high` / `📅 YYYY-MM-DD` syntax collectTodos reads back. */
export function formatTodoLine(text: string, priority: "high" | "medium" | null, due: string | null): string {
  const parts = [`- [ ] ${text.trim()}`];
  if (priority) parts.push(`#${priority}`);
  if (due) parts.push(`📅 ${due}`);
  return parts.join(" ");
}

function headingAt(line: string): { level: number; text: string } | null {
  const match = HEADING_RE.exec(line);
  return match ? { level: match[1].length, text: match[2] } : null;
}

function findHeading(lines: string[], name: string): { index: number; level: number } | null {
  for (let i = 0; i < lines.length; i++) {
    const heading = headingAt(lines[i]);
    if (heading?.text === name) return { index: i, level: heading.level };
  }
  return null;
}

/** Which status heading `lineNo` sits under, counting sub-headings like `### 仕事` beneath it. */
function statusHeadingOf(lines: string[], lineNo: number): string | null {
  let level = 7;
  for (let i = lineNo - 1; i >= 0 && level > 1; i--) {
    const heading = headingAt(lines[i]);
    if (!heading || heading.level >= level) continue;
    if (heading.text === ACTIVE_HEADING || heading.text === DONE_HEADING) return heading.text;
    level = heading.level;
  }
  return null;
}

/** Returns the index of the `name` heading, adding it (進行中 above 完了, 完了 at the end) when missing. */
function ensureHeading(lines: string[], name: string): number {
  const found = findHeading(lines, name);
  if (found) return found.index;
  const other = findHeading(lines, name === ACTIVE_HEADING ? DONE_HEADING : ACTIVE_HEADING);
  const heading = `${"#".repeat(other?.level ?? 2)} ${name}`;
  if (name === ACTIVE_HEADING && other) {
    lines.splice(other.index, 0, heading, "");
    return other.index;
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length > 0) lines.push("");
  lines.push(heading, "");
  return lines.length - 2;
}

/** Newest first: just above the first item under the heading, or after any text written under it. */
function topOfSection(lines: string[], headingIndex: number): number {
  let lastText = headingIndex;
  for (let i = headingIndex + 1; i < lines.length; i++) {
    if (headingAt(lines[i])) break;
    if (LIST_ITEM_RE.test(lines[i])) return i;
    if (lines[i].trim()) lastText = i;
  }
  return lastText + 1;
}

/** Writes a new Todo at the top of the note's 進行中 section, creating the note (and its folders) when missing. */
export async function addTodoToNote(app: App, path: string, line: string): Promise<TFile> {
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    await app.vault.process(existing, (content) => {
      const lines = content.split("\n");
      lines.splice(topOfSection(lines, ensureHeading(lines, ACTIVE_HEADING)), 0, line);
      return lines.join("\n");
    });
    return existing;
  }
  await ensureParentFolder(app, path);
  return app.vault.create(path, `## ${ACTIVE_HEADING}\n${line}\n\n## ${DONE_HEADING}\n`);
}

/**
 * Checks or unchecks a Todo. In the Todo note a top-level item also moves, with its indented lines,
 * to the top of 完了 (or back to the top of 進行中); anywhere else only the checkbox changes.
 * Returns false when the line is no longer in the note. `todo` is updated to match what was written.
 */
export async function setTodoDone(app: App, todo: TodoItem, done: boolean, todoNotePath: string): Promise<boolean> {
  let written = false;
  await app.vault.process(todo.file, (content) => {
    const lines = content.split("\n");
    const at = lines[todo.line] === todo.raw ? todo.line : lines.indexOf(todo.raw);
    const match = at >= 0 ? CHECKBOX_RE.exec(lines[at]) : null;
    if (!match) return content;

    const updated = `${match[1]}${done ? "x" : " "}${match[3]}${match[4]}`;
    const target = done ? DONE_HEADING : ACTIVE_HEADING;
    let line = at;
    if (todo.file.path !== todoNotePath || /^\s/.test(updated) || statusHeadingOf(lines, at) === target) {
      lines[at] = updated;
    } else {
      let end = at + 1;
      while (end < lines.length && /^\s+\S/.test(lines[end])) end++;
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
