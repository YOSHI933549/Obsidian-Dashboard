import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, moment } from "obsidian";
import { DashboardView, VIEW_TYPE_PENCIL_DASHBOARD } from "./view";
import { Background, BACKGROUNDS } from "./backgrounds";
import { datedNotePath, getDailyNoteSettings } from "./data";

interface PencilDashboardSettings {
  background: Background;
  todoFolder: string;
  /** moment format for the Todo note's name; blank means "same as the daily notes format". */
  todoFormat: string;
}

const DEFAULT_SETTINGS: PencilDashboardSettings = {
  background: "paper",
  todoFolder: "Todo",
  todoFormat: "",
};

const FILTER_HOST_ID = "pencil-dashboard-svg-defs";

/** Injects the shared SVG filters/pattern once per window; CSS `filter: url(#pd-pencil)` needs them in the DOM. */
function ensureSvgDefs(): void {
  if (document.getElementById(FILTER_HOST_ID)) return;
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

export default class PencilDashboardPlugin extends Plugin {
  settings: PencilDashboardSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
    ensureSvgDefs();

    this.addSettingTab(new PencilDashboardSettingTab(this.app, this));

    this.addCommand({
      id: "toggle-background",
      name: "背景を切り替え（紙 ⇔ コルクボード）",
      callback: () => this.setBackground(this.settings.background === "paper" ? "cork" : "paper"),
    });

    this.registerView(VIEW_TYPE_PENCIL_DASHBOARD, (leaf) => new DashboardView(leaf, this));

    this.addRibbonIcon("pencil", "Open pencil dashboard", () => this.activateView());

    this.addCommand({
      id: "open-pencil-dashboard",
      name: "Open dashboard",
      callback: () => this.activateView(),
    });
  }

  onunload(): void {
    document.getElementById(FILTER_HOST_ID)?.remove();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Where a Todo added on `date` is written, laid out like the daily notes (e.g. Todo/2026/09/2026-09-27.md). */
  todoNotePath(date: moment.Moment): string {
    const format = this.settings.todoFormat.trim() || getDailyNoteSettings(this.app).format;
    return datedNotePath(this.settings.todoFolder, format, date);
  }

  async setBackground(background: Background): Promise<void> {
    this.settings.background = background;
    await this.saveSettings();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_PENCIL_DASHBOARD)) {
      if (leaf.view instanceof DashboardView) leaf.view.applyBackground();
    }
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_PENCIL_DASHBOARD)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_PENCIL_DASHBOARD, active: true });
    }
    workspace.revealLeaf(leaf);
  }
}

class PencilDashboardSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: PencilDashboardPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName("背景")
      .setDesc("ダッシュボードの背景を選びます。")
      .addDropdown((dropdown) => {
        for (const [value, label] of Object.entries(BACKGROUNDS)) dropdown.addOption(value, label);
        dropdown
          .setValue(this.plugin.settings.background)
          .onChange((value) => this.plugin.setBackground(value as Background));
      });

    new Setting(containerEl).setName("Todo").setHeading();

    new Setting(containerEl)
      .setName("保存先フォルダー")
      .setDesc("ダッシュボードで追加したTodoを入れるフォルダー。無ければ自動で作ります。")
      .addText((text) =>
        text
          .setPlaceholder("Todo")
          .setValue(this.plugin.settings.todoFolder)
          .onChange(async (value) => {
            this.plugin.settings.todoFolder = value.trim();
            await this.plugin.saveSettings();
            updateExample();
          })
      );

    new Setting(containerEl)
      .setName("ノート名の書式")
      .setDesc(
        "デイリーノートと同じ書き方です。空欄ならデイリーノートの書式と同じになります" +
          "（例: YYYY/MM/YYYY-MM-DD で日ごと、YYYY/YYYY-MM で月ごと、[Inbox] で1つのノートにまとめる）。"
      )
      .addText((text) =>
        text
          .setPlaceholder(getDailyNoteSettings(this.app).format)
          .setValue(this.plugin.settings.todoFormat)
          .onChange(async (value) => {
            this.plugin.settings.todoFormat = value.trim();
            await this.plugin.saveSettings();
            updateExample();
          })
      );

    const example = new Setting(containerEl).setName("今日追加すると");
    const updateExample = () => example.setDesc(`${this.plugin.todoNotePath(moment())} の末尾に書き足されます。`);
    updateExample();
  }
}
