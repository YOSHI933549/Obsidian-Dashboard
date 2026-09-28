const FONT_LINK_ID = "pencil-dashboard-fonts";

/** Links the handwriting fonts the first time a dashboard opens, so starting Obsidian never waits on Google Fonts. */
export function ensureFonts(): void {
  if (document.getElementById(FONT_LINK_ID)) return;
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Kalam:wght@300;400;700&family=Coming+Soon&family=Klee+One:wght@400;600&display=swap";
  document.head.appendChild(link);
}

export function removeFonts(): void {
  document.getElementById(FONT_LINK_ID)?.remove();
}
