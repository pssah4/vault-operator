# Design-Regeln Obsilo

> Max 100 Zeilen. Nur laden wenn UI-Aenderungen anstehen.

## Visuelles System

- Obsilo orientiert sich am Obsidian-Theme. Eigene Farben nur fuer
  klar abgegrenzte Branding-Elemente (Sidebar-Header, Onboarding-
  Akzent).
- Spacing-System uebernimmt Obsidian-Defaults: `var(--size-2-1)`,
  `var(--size-4-1)` etc., keine eigenen Pixelwerte
- Schrift: Obsidian-System-Font-Stack uebernehmen, keine Custom-Fonts

## CSS-Konventionen

- Klassen-Praefix `agent-u-*` fuer projekt-eigene Klassen (Review-Bot
  Pflicht: keine inline-styles)
- CSS-Variablen ueber Obsidian-Theme: `var(--background-primary)`,
  `var(--text-normal)`, `var(--interactive-accent)`
- Dark-Theme-Kompatibilitaet ist Pflicht. Niemals fixe Hintergrund-
  oder Textfarben hardcoden

## Komponenten-Patterns

- Modals haben einen Titel, einen scrollbaren Body und eine Footer-
  Toolbar mit Buttons rechts
- Settings-Tabs nutzen die Obsidian-Setting-API (`new Setting(containerEl)`)
- Sidebar-Aktionen kommen ueber Command-Palette ODER Sidebar-Buttons,
  niemals nur ueber Hidden-Hotkeys
- Loading-States: Skeleton oder spinner, niemals weisse Boxen

## Accessibility

- Alle interaktiven Elemente per Tastatur erreichbar (Tab-Order)
- ARIA-Labels auf Icon-only-Buttons
- Farbkontrast >= 4.5:1, geprueft auf hellen und dunklen Themes

## Animationen

- Dauer 150 bis 300ms, ease-out
- `prefers-reduced-motion` respektieren

## Obsidian DOM API (Pflicht)

- `containerEl.createDiv()`, `createEl('span')`, `createEl('button')`
- Niemals `innerHTML`, niemals `outerHTML`, niemals
  `appendChild(parseHTML(...))`
- Text setzen ueber `setText()` oder `appendText()`
