import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from "obsidian";
import { DashboardView, VIEW_TYPE_PENCIL_DASHBOARD } from "./view";

export type Background = "paper" | "cork";

export const BACKGROUNDS: Record<Background, string> = {
  paper: "紙",
  cork: "コルクボード",
};

interface PencilDashboardSettings {
  background: Background;
}

const DEFAULT_SETTINGS: PencilDashboardSettings = {
  background: "paper",
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

  async setBackground(background: Background): Promise<void> {
    this.settings.background = background;
    await this.saveData(this.settings);
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
  }
}
