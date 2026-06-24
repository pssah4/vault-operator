<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

/*
 * Vault Operator landing-page demo.
 *
 * A single-flow scenario:
 *   1. Editor-only view, note about "Token Cost Optimization"
 *   2. User selects a paragraph -> inline chat checks currency, rewrites with a web source
 *   3. User selects the strategy list -> inline chat adds the missing "Semantic caching" entry
 *   4. User hands off to the sidebar -> sidebar slides in from the right
 *   5. Sidebar request: build a Canvas of related notes, edges labeled with connection type
 *   6. Sidebar request: turn the Canvas into a Base with extra Meetings + People columns
 *
 * The window is locked to light mode regardless of the surrounding VitePress theme
 * (explicit `--ed-*` variables in `.ed-window`). The recording GIF in the README is
 * captured from this same component.
 */

const A =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"'
const ICONS: Record<string, string> = {
  git: `<svg ${A}><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
  grid: `<svg ${A}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>`,
  files: `<svg ${A}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  terminal: `<svg ${A}><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
  mic: `<svg ${A}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>`,
  panelLeft: `<svg ${A}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`,
  tree: `<svg ${A}><path d="M21 12h-8"/><path d="M21 6H8"/><path d="M21 18h-8"/><path d="M3 6v4c0 1.1.9 2 2 2h3"/><path d="M3 10v6c0 1.1.9 2 2 2h3"/></svg>`,
  printer: `<svg ${A}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
  monitor: `<svg ${A}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
  image: `<svg ${A}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  fingerprint: `<svg ${A}><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/></svg>`,
  wrench: `<svg ${A}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  calendar: `<svg ${A}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  checkSquare: `<svg ${A}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  list: `<svg ${A}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  columns: `<svg ${A}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>`,
  chart: `<svg ${A}><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>`,
  pen: `<svg ${A}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  fileText: `<svg ${A}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
  layout: `<svg ${A}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`,
  globe: `<svg ${A}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  search: `<svg ${A}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  gitFork: `<svg ${A}><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"/><path d="M12 12v3"/></svg>`,
  link: `<svg ${A}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  tag: `<svg ${A}><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
  voSquare: `<svg ${A}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="14" y1="8" x2="10" y2="16"/></svg>`,
  panelRight: `<svg ${A}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`,
  sendToSidebar: `<svg ${A}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/><polyline points="7 9 10 12 7 15"/></svg>`,
  stethoscope: `<svg ${A}><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg>`,
  settings: `<svg ${A}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  history: `<svg ${A}><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><polyline points="12 7 12 12 15 15"/></svg>`,
  newChat: `<svg ${A}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="9" y1="10" x2="15" y2="10"/></svg>`,
  plus: `<svg ${A}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  more: `<svg ${A}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`,
  send: `<svg ${A}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  chevronDown: `<svg ${A}><polyline points="6 9 12 15 18 9"/></svg>`,
  arrowLeft: `<svg ${A}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
  arrowRight: `<svg ${A}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  checkCircle: `<svg ${A}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  x: `<svg ${A}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  canvas: `<svg ${A}><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>`,
  clipboard: `<svg ${A}><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>`,
  sparkle: `<svg ${A}><path d="M12 3v3"/><path d="M12 18v3"/><path d="m4.9 4.9 2.1 2.1"/><path d="m17 17 2.1 2.1"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="m4.9 19.1 2.1-2.1"/><path d="m17 7 2.1-2.1"/></svg>`,
  circle: `<svg ${A}><circle cx="12" cy="12" r="9"/></svg>`,
  loader: `<svg ${A}><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>`,
  mousePointer: `<svg viewBox="0 0 24 24" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"><path d="M3 3l7 17 2.4-6.6L19 11z"/></svg>`,
  wandSparkles: `<svg ${A}><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></svg>`,
}
function icon(name: string): string { return ICONS[name] || '' }

/* Token count formatter matching AgentSidebarView.formatTokens: */
function fmtK(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'k'
  return String(num)
}

const ribbonIcons = [
  'git', 'grid', 'files', 'terminal', 'mic', 'panelLeft', 'tree', 'chart',
  'printer', 'monitor', 'search', 'fingerprint', 'image', 'wrench', 'calendar',
  'checkSquare', 'list', 'columns', 'pen',
]
const voTabs = ['gitFork', 'link', 'tag', 'list']

/* ── note content ── */
interface Para { id: string; text: string; updated?: string }
const introPara: Para = {
  id: 'intro',
  text: 'LLM token spend grows quickly once prompts get long, agents loop, or output volume rises. The five levers below cover where most of the cost actually lives.',
}
const sectionTitle = 'Core strategies'

interface Strategy { id: string; name: string; text: string; updated?: string }
const strategies: Strategy[] = [
  {
    id: 'caching',
    name: 'Prompt caching',
    text: 'Cache the stable system + context prefix so repeat calls only pay for the new turn.',
    updated: 'Cache the stable prefix once and reuse it on every follow-up. With Anthropic\'s 1-hour cache, multi-step agents save 75-90% on input tokens for the cached portion.',
  },
  { id: 'compression', name: 'Prompt compression', text: 'Summarise or condense long history before sending it back to the model.' },
  { id: 'routing', name: 'Model routing', text: 'Send simple turns to a cheap model and only escalate hard ones to the flagship.' },
  { id: 'output', name: 'Output caps', text: 'Pin max_tokens to a realistic ceiling so a runaway generation cannot eat the budget.' },
  { id: 'batch', name: 'Batch API', text: 'Move offline workloads to the batch endpoint to get a 50% discount for the same model.' },
]
const newStrategy: Strategy = {
  id: 'semantic',
  name: 'Semantic caching',
  text: 'Reuse cached answers when a new prompt is semantically equivalent. Embedding-similarity cache hits avoid the model call entirely. Production rollouts report 30-40% lower spend on repeat-heavy traffic.',
}

/* ── canvas geometry: clean radial layout, edges meet box borders ── */
interface CNode { x: number; y: number; w: number; h: number; label: string }
const CN: CNode[] = [
  { x: 50, y: 50, w: 36, h: 11, label: 'Token Cost Optimization' },
  { x: 50, y: 14, w: 22, h: 9, label: 'Prompt caching' },
  { x: 82, y: 30, w: 22, h: 9, label: 'Model routing' },
  { x: 84, y: 70, w: 18, h: 9, label: 'Batch API' },
  { x: 50, y: 88, w: 24, h: 9, label: 'Semantic caching' },
  { x: 16, y: 70, w: 20, h: 9, label: 'Output caps' },
  { x: 18, y: 30, w: 20, h: 9, label: 'Compression' },
]
const CE: { a: number; b: number; l: string }[] = [
  { a: 0, b: 1, l: 'reduces input' },
  { a: 0, b: 2, l: 'lowers per-call price' },
  { a: 0, b: 3, l: '50% off offline runs' },
  { a: 0, b: 4, l: 'avoids repeat calls' },
  { a: 0, b: 5, l: 'caps runaway output' },
  { a: 0, b: 6, l: 'shrinks history' },
]
function edgeEndpoint(from: CNode, to: CNode) {
  // intersection of segment from->to with the bounding box of `from`
  const dx = to.x - from.x
  const dy = to.y - from.y
  const halfW = from.w / 2
  const halfH = from.h / 2
  const tx = dx === 0 ? Infinity : Math.abs(halfW / dx)
  const ty = dy === 0 ? Infinity : Math.abs(halfH / dy)
  const t = Math.min(tx, ty)
  return { x: from.x + dx * t, y: from.y + dy * t }
}
function edgePath(e: { a: number; b: number }) {
  const A0 = edgeEndpoint(CN[e.a], CN[e.b])
  const B0 = edgeEndpoint(CN[e.b], CN[e.a])
  return { x1: A0.x, y1: A0.y, x2: B0.x, y2: B0.y }
}
function edgeMid(e: { a: number; b: number }) {
  const p = edgePath(e)
  return { x: (p.x1 + p.x2) / 2, y: (p.y1 + p.y2) / 2 }
}

/* ── base content (canvas-derived, plus the two extra cols) ── */
interface BaseRow { name: string; type: string; meetings: string; people: string }
const baseRows: BaseRow[] = [
  { name: 'Token Cost Optimization', type: 'topic', meetings: 'Q3 cost review', people: 'Mia Khan, Tom Lee' },
  { name: 'Prompt caching', type: 'strategy', meetings: 'Agent platform sync', people: 'Tom Lee' },
  { name: 'Model routing', type: 'strategy', meetings: 'Q3 cost review', people: 'Mia Khan, Sara P.' },
  { name: 'Batch API', type: 'strategy', meetings: 'Data team standup', people: 'Sara P.' },
  { name: 'Semantic caching', type: 'strategy', meetings: 'Agent platform sync', people: 'Tom Lee, John Doe' },
  { name: 'Output caps', type: 'strategy', meetings: 'Incident review', people: 'Mia Khan' },
  { name: 'Compression', type: 'strategy', meetings: 'Agent platform sync', people: 'Tom Lee' },
]

/* ── reactive state ── */
type Phase =
  | 'editor-solo'         // only the editor visible, full width
  | 'editor-with-inline'  // editor + floating inline chat panel
  | 'sidebar-opening'     // sidebar sliding in
  | 'sidebar-open'        // full layout (ribbon + editor + sidebar)
const phase = ref<Phase>('editor-solo')

type View = 'note' | 'canvas' | 'base'
const view = ref<View>('note')

const tab = ref<{ name: string; kind: 'note' | 'canvas' | 'base' }>({ name: 'Token Cost Optimization.md', kind: 'note' })

// note rendering state
const updatedIds = ref<Set<string>>(new Set())
const showSemantic = ref(false)
const selectionId = ref<string | null>(null) // which paragraph/list region is "selected"

// inline chat panel
const inlineOpen = ref(false)
const inlineAnchor = ref<'caching' | 'list'>('caching')
const inlineInput = ref('')
const inlineTyping = ref(false)
interface TodoItem { text: string; status: 'pending' | 'in_progress' | 'done' }
interface CostUsage { tIn: number; tOut: number; tCached: number; hitPct: number; eur: number }
type InlineMsg =
  | { kind: 'user'; text: string }
  | { kind: 'tool'; tool: string; icon: string; status: 'running' | 'done'; detail: string }
  | { kind: 'text'; text: string }
  | { kind: 'plan'; items: TodoItem[] }
  | { kind: 'cost'; usage: CostUsage }
const inlineMsgs = ref<InlineMsg[]>([])
const inlineSendHover = ref(false)
const inlineActiveAction = ref<'lookup' | 'rewrite' | null>(null)

// sidebar chat
const sidebarMsgs = ref<InlineMsg[]>([])
const sidebarInput = ref('')
const sidebarTyping = ref(false)

// animated mouse cursor (drives the "user is selecting text" affordance)
const cursorOn = ref(false)
const cursorX = ref(0)
const cursorY = ref(0)
const cursorClicking = ref(false)

// FEAT-33-12 selection-affordance pill (wand-sparkles icon that pops up
// next to a settled selection; clicking it opens the inline chat).
const pillOn = ref(false)
const pillX = ref(0)
const pillY = ref(0)
const pillClicked = ref(false)

// Send-to-sidebar button click animation in the inline composer
const inlineSendClicking = ref(false)

// strategy element refs (for cursor + selection coordinates)
const strategyEls = ref(new Map<string, HTMLElement>())
function setStrategyEl(id: string) {
  return (el: Element | { $el?: Element } | null) => {
    if (el === null) { strategyEls.value.delete(id); return }
    const dom = (el as { $el?: Element }).$el ?? (el as Element)
    strategyEls.value.set(id, dom as HTMLElement)
  }
}
const contentEl = ref<HTMLElement | null>(null)

// Handoff snapshot: copy of the inline chat at the moment the user clicks
// "Send to sidebar". Renders in the sidebar as a single "transferred"
// block so the user can see the full conversation moved across.
const handoffMsgs = ref<InlineMsg[]>([])
const handoffVisible = ref(false)

// canvas / base reveal counters
const canvasNodes = ref(0)
const canvasEdges = ref(0)
const canvasLabels = ref(false)
const baseRowsShown = ref(0)
const baseColsExtra = ref(false)

const chatScroll = ref<HTMLDivElement | null>(null)
const inlineScroll = ref<HTMLDivElement | null>(null)
const noteEl = ref<HTMLDivElement | null>(null)
const inlinePanelEl = ref<HTMLElement | null>(null)
function setInlinePanelEl(el: Element | null | { $el?: Element }) {
  // Function ref for the inline-block panel; works inside v-for where a
  // string ref would otherwise resolve to an array (or undefined for the
  // branch that's not currently rendered).
  if (el === null) { inlinePanelEl.value = null; return }
  const dom = (el as { $el?: Element }).$el ?? (el as Element)
  inlinePanelEl.value = dom as HTMLElement
}

/* ── timer + async plumbing ── */
const timers: number[] = []
let gen = 0
function at(fn: () => void, ms: number) {
  const id = window.setTimeout(() => {
    const idx = timers.indexOf(id)
    if (idx !== -1) timers.splice(idx, 1)
    fn()
  }, ms)
  timers.push(id)
}
function clearAll() { timers.forEach((t) => clearTimeout(t)); timers.length = 0 }
function wait(ms: number) { return new Promise<void>((res) => at(res, ms)) }

async function typeInto(target: 'inline' | 'sidebar', text: string, alive: () => boolean) {
  if (target === 'inline') inlineTyping.value = true
  else sidebarTyping.value = true
  for (let i = 1; i <= text.length; i++) {
    if (!alive()) return
    if (target === 'inline') {
      inlineInput.value = text.slice(0, i)
      // While typing into the inline composer the input may wrap to a
      // 2nd/3rd line, growing the panel; keep the composer in view.
      if (i % 10 === 0) scrollInline()
    } else sidebarInput.value = text.slice(0, i)
    await wait(18)
  }
  if (target === 'inline') {
    inlineTyping.value = false
    scrollInline()
  } else sidebarTyping.value = false
}

function scrollSidebar() {
  at(() => { if (chatScroll.value) chatScroll.value.scrollTop = chatScroll.value.scrollHeight }, 30)
}
function scrollInline() {
  // Run twice: once now (catches the latest measurable layout after the
  // ref settles), once after a frame (catches the transition's resting
  // size when the panel is mid-grow). Instant scrollTop -- smooth scroll
  // races the next message push and the panel can outrun the animation.
  const apply = () => {
    if (inlineScroll.value) inlineScroll.value.scrollTop = inlineScroll.value.scrollHeight
    if (inlinePanelEl.value && noteEl.value) {
      const note = noteEl.value
      const panel = inlinePanelEl.value
      // getBoundingClientRect gives viewport-relative positions regardless
      // of offsetParent. We want the panel's bottom edge to sit ~14px
      // above the visible bottom of the note pane.
      const noteRect = note.getBoundingClientRect()
      const panelRect = panel.getBoundingClientRect()
      const delta = panelRect.bottom - noteRect.bottom + 14
      if (delta > 0) {
        note.scrollTop = note.scrollTop + delta
      }
    }
  }
  at(apply, 40)
  at(apply, 220) // catch the rest-state once the ed-block transition settles
}

/* ── cursor positioning + animated selection ── */
function pointForStrategy(id: string, side: 'start' | 'end'): { x: number; y: number } | null {
  const el = strategyEls.value.get(id)
  const root = contentEl.value
  if (!el || !root) return null
  const r = el.getBoundingClientRect()
  const cR = root.getBoundingClientRect()
  if (side === 'start') {
    return { x: r.left - cR.left + 36, y: r.top - cR.top + r.height * 0.55 }
  }
  return { x: r.right - cR.left - 12, y: r.bottom - cR.top - 8 }
}

async function animateSelection(
  startId: string,
  endId: string,
  selValue: string,
  alive: () => boolean,
) {
  const startP = pointForStrategy(startId, 'start')
  const endP = pointForStrategy(endId, 'end')
  if (!startP || !endP || !contentEl.value) return
  const cw = contentEl.value.clientWidth

  // 1) Cursor swoops in from the right edge of the editor
  cursorX.value = cw - 30
  cursorY.value = startP.y - 60
  cursorOn.value = true
  await wait(80); if (!alive()) return

  // 2) Travel to the start of the selection text
  cursorX.value = startP.x
  cursorY.value = startP.y
  await wait(620); if (!alive()) return

  // 3) Click-down (small scale + pause), then start the highlight
  cursorClicking.value = true
  await wait(180); if (!alive()) return
  selectionId.value = selValue

  // 4) Drag-to-end: cursor traverses the text, highlight already visible
  cursorX.value = endP.x
  cursorY.value = endP.y
  await wait(640); if (!alive()) return

  // 5) Release click + pause to read
  cursorClicking.value = false
  await wait(260); if (!alive()) return
}

async function clickActionPill(endId: string, alive: () => boolean) {
  // Spawns the wand-sparkles affordance pill above-right of the selection
  // end, then walks the cursor over and clicks it. Mirrors the EPIC-33
  // action-pill UX: settled selection -> pill appears -> click -> inline
  // chat opens.
  const endP = pointForStrategy(endId, 'end')
  if (!endP || !contentEl.value) return

  // 1) Pop the pill into existence with a small scale-in
  pillX.value = endP.x + 8
  pillY.value = endP.y - 18
  pillOn.value = true
  await wait(220); if (!alive()) return

  // 2) Cursor walks over to the pill
  cursorX.value = pillX.value + 14
  cursorY.value = pillY.value + 18
  await wait(420); if (!alive()) return

  // 3) Click
  cursorClicking.value = true
  pillClicked.value = true
  await wait(180); if (!alive()) return

  // 4) Pill disappears (fades + scales out), cursor releases
  pillOn.value = false
  cursorClicking.value = false
  await wait(180); if (!alive()) return
  pillClicked.value = false

  // 5) Cursor slips off-screen so the panel can take focus
  const cw = contentEl.value.clientWidth
  cursorX.value = cw + 40
  cursorY.value = pillY.value - 10
  cursorOn.value = false
}

/* ── scene runner ── */
async function runScene1(alive: () => boolean) {
  // intro pause to read the note
  await wait(900); if (!alive()) return
}

async function runInlineRewrite(alive: () => boolean) {
  // Cursor swoops in, clicks at the start of "Prompt caching", drags
  // across the line. The text highlight stays on the row at the end.
  await animateSelection('caching', 'caching', 'caching', alive); if (!alive()) return

  // Wand-sparkles action pill pops up next to the selection; cursor
  // walks over and clicks it (FEAT-33-12 selection-affordance pill).
  await clickActionPill('caching', alive); if (!alive()) return

  // open inline panel above the selection
  inlineAnchor.value = 'caching'
  inlineOpen.value = true
  phase.value = 'editor-with-inline'
  await wait(600); if (!alive()) return
  scrollInline()  // anchor the freshly-opened panel into the viewport

  // type the prompt
  await typeInto('inline', 'Check this concept for currency and update it if needed.', alive); if (!alive()) return
  await wait(450); if (!alive()) return

  inlineMsgs.value.push({ kind: 'user', text: inlineInput.value })
  inlineInput.value = ''
  scrollInline()
  inlineActiveAction.value = 'lookup'
  await wait(350); if (!alive()) return

  // tool: web_search
  const t1: InlineMsg = { kind: 'tool', tool: 'web_search', icon: 'globe', status: 'running', detail: '"prompt caching anthropic 2025"' }
  inlineMsgs.value.push(t1); scrollInline()
  await wait(1100); if (!alive()) return
  ;(t1 as any).status = 'done'
  ;(t1 as any).detail = 'anthropic.com - extended prompt caching'
  scrollInline()
  await wait(450); if (!alive()) return

  // tool: edit_file (rewrite the paragraph)
  const t2: InlineMsg = { kind: 'tool', tool: 'edit_file', icon: 'pen', status: 'running', detail: 'updating "Prompt caching"' }
  inlineMsgs.value.push(t2); scrollInline()
  await wait(900); if (!alive()) return

  // swap the paragraph in the note
  updatedIds.value = new Set([...updatedIds.value, 'caching'])
  ;(t2 as any).status = 'done'
  ;(t2 as any).detail = '1 paragraph rewritten'
  scrollInline()
  await wait(500); if (!alive()) return

  inlineMsgs.value.push({ kind: 'text', text: 'Rewritten with the 1-hour cache figure from the Anthropic docs.' })
  scrollInline()
  await wait(1100); if (!alive()) return

  // close inline panel, reset
  inlineActiveAction.value = null
  inlineOpen.value = false
  inlineMsgs.value = []
  selectionId.value = null
  phase.value = 'editor-solo'
  await wait(500); if (!alive()) return
}

async function runInlineAddMissing(alive: () => boolean) {
  // Cursor drag-selects the whole list of strategies (Prompt caching ->
  // Batch API). selectionId='list' highlights every row.
  await animateSelection('caching', 'batch', 'list', alive); if (!alive()) return

  // Wand-sparkles pill appears next to the bottom-right of the list,
  // cursor clicks it -> inline chat opens.
  await clickActionPill('batch', alive); if (!alive()) return

  inlineAnchor.value = 'list'
  inlineOpen.value = true
  phase.value = 'editor-with-inline'
  await wait(600); if (!alive()) return
  scrollInline()  // anchor the freshly-opened panel into the viewport

  await typeInto(
    'inline',
    'Check these categories for completeness. Use web search to look up "semantic caching" and add it if it is missing.',
    alive,
  ); if (!alive()) return
  await wait(450); if (!alive()) return

  inlineMsgs.value.push({ kind: 'user', text: inlineInput.value })
  inlineInput.value = ''
  scrollInline()
  inlineActiveAction.value = 'rewrite'
  await wait(350); if (!alive()) return

  const t1: InlineMsg = { kind: 'tool', tool: 'web_search', icon: 'globe', status: 'running', detail: '"semantic caching LLM"' }
  inlineMsgs.value.push(t1); scrollInline()
  await wait(1100); if (!alive()) return
  ;(t1 as any).status = 'done'
  ;(t1 as any).detail = '3 sources, including portkey.ai'
  scrollInline()
  await wait(450); if (!alive()) return

  const t2: InlineMsg = { kind: 'tool', tool: 'append_to_file', icon: 'pen', status: 'running', detail: 'adding "Semantic caching"' }
  inlineMsgs.value.push(t2); scrollInline()
  await wait(900); if (!alive()) return

  showSemantic.value = true
  ;(t2 as any).status = 'done'
  ;(t2 as any).detail = '1 entry added'
  scrollInline()
  await wait(500); if (!alive()) return

  inlineMsgs.value.push({ kind: 'text', text: 'Added "Semantic caching" - the other five strategies are already covered.' })
  scrollInline()
  await wait(1200); if (!alive()) return
}

async function runHandoffToSidebar(alive: () => boolean) {
  // 1) Cursor walks back into view and onto the "Send to sidebar" button
  //    (it sits in the inline panel's toolbar, right of the "..." menu).
  if (contentEl.value && inlinePanelEl.value) {
    const cRect = contentEl.value.getBoundingClientRect()
    const btn = inlinePanelEl.value.querySelector<HTMLElement>('.ed-bar-to-sidebar')
    if (btn) {
      const bRect = btn.getBoundingClientRect()
      // Approach from the right edge
      cursorX.value = cRect.width - 30
      cursorY.value = bRect.top - cRect.top + 30
      cursorOn.value = true
      await wait(120); if (!alive()) return
      // Hover the button
      cursorX.value = bRect.left - cRect.left + 8
      cursorY.value = bRect.top - cRect.top + 8
      inlineSendHover.value = true
      await wait(500); if (!alive()) return
      // Click
      cursorClicking.value = true
      inlineSendClicking.value = true
      await wait(200); if (!alive()) return
      cursorClicking.value = false
      inlineSendClicking.value = false
    }
  }

  // 2) Snapshot the entire inline conversation so it shows up in the
  //    sidebar as a "transferred" card.
  handoffMsgs.value = [...inlineMsgs.value]

  // 3) Sidebar slides in; cursor fades out off-screen
  cursorOn.value = false
  phase.value = 'sidebar-opening'
  await wait(450); if (!alive()) return
  phase.value = 'sidebar-open'

  // 4) The inline panel closes once the sidebar is taking over.
  inlineSendHover.value = false
  inlineOpen.value = false
  inlineActiveAction.value = null
  inlineMsgs.value = []
  selectionId.value = null
  await wait(250); if (!alive()) return

  // 5) Reveal the handoff card in the sidebar (slides down into place)
  handoffVisible.value = true
  scrollSidebar()
  await wait(1400); if (!alive()) return
}

async function runSidebarCanvas(alive: () => boolean) {
  await typeInto(
    'sidebar',
    'Create a canvas that maps every note in the vault related to Token Cost Optimization. Label each edge with the type of connection.',
    alive,
  ); if (!alive()) return
  await wait(450); if (!alive()) return

  sidebarMsgs.value.push({ kind: 'user', text: sidebarInput.value })
  sidebarInput.value = ''
  scrollSidebar()
  await wait(350); if (!alive()) return

  // Plan first -- the agent shows a todo-list (mirrors update_todo_list)
  const plan: TodoItem[] = [
    { text: 'Find related notes via semantic search', status: 'in_progress' },
    { text: 'Lay out the canvas with the hub + spokes', status: 'pending' },
    { text: 'Label each edge with the connection type', status: 'pending' },
  ]
  const planMsg: InlineMsg = { kind: 'plan', items: plan }
  sidebarMsgs.value.push(planMsg)
  scrollSidebar()
  await wait(500); if (!alive()) return

  const t1: InlineMsg = { kind: 'tool', tool: 'semantic_search', icon: 'search', status: 'running', detail: '"token cost optimization"' }
  sidebarMsgs.value.push(t1); scrollSidebar()
  await wait(1100); if (!alive()) return
  ;(t1 as any).status = 'done'
  ;(t1 as any).detail = '6 related notes'
  plan[0].status = 'done'
  plan[1].status = 'in_progress'
  scrollSidebar()
  await wait(350); if (!alive()) return

  const t2: InlineMsg = { kind: 'tool', tool: 'generate_canvas', icon: 'canvas', status: 'running', detail: 'placing 7 nodes' }
  sidebarMsgs.value.push(t2); scrollSidebar()
  await wait(700); if (!alive()) return

  // switch to canvas tab
  view.value = 'canvas'
  tab.value = { name: 'Token Cost Optimization.canvas', kind: 'canvas' }

  // reveal nodes
  for (let i = 0; i < CN.length; i++) {
    if (!alive()) return
    canvasNodes.value = i + 1
    await wait(170)
  }
  // reveal edges
  for (let i = 0; i < CE.length; i++) {
    if (!alive()) return
    canvasEdges.value = i + 1
    await wait(110)
  }
  plan[1].status = 'done'
  plan[2].status = 'in_progress'
  await wait(250); if (!alive()) return
  canvasLabels.value = true

  ;(t2 as any).status = 'done'
  ;(t2 as any).detail = '7 nodes, 6 labeled edges'
  plan[2].status = 'done'
  scrollSidebar()
  await wait(500); if (!alive()) return

  sidebarMsgs.value.push({ kind: 'text', text: 'Canvas is up. Each spoke is labeled with how it reduces token cost.' })
  // Cost footer (simulates TaskMonitor.onUsage rendering)
  sidebarMsgs.value.push({
    kind: 'cost',
    usage: { tIn: 4280, tOut: 380, tCached: 3640, hitPct: 85, eur: 0.02 },
  })
  scrollSidebar()
  await wait(1700); if (!alive()) return
}

async function runSidebarBase(alive: () => boolean) {
  await typeInto(
    'sidebar',
    'Turn this canvas into a Base. Add columns for which meetings these topics came up in and which people I discussed them with. Then show me the Base.',
    alive,
  ); if (!alive()) return
  await wait(450); if (!alive()) return

  sidebarMsgs.value.push({ kind: 'user', text: sidebarInput.value })
  sidebarInput.value = ''
  scrollSidebar()
  await wait(350); if (!alive()) return

  const plan2: TodoItem[] = [
    { text: 'Read the canvas nodes', status: 'in_progress' },
    { text: 'Pull meetings + people from chat history', status: 'pending' },
    { text: 'Create the Base with the extra columns', status: 'pending' },
  ]
  sidebarMsgs.value.push({ kind: 'plan', items: plan2 })
  scrollSidebar()
  await wait(450); if (!alive()) return

  const t1: InlineMsg = { kind: 'tool', tool: 'read_canvas', icon: 'canvas', status: 'running', detail: 'Token Cost Optimization.canvas' }
  sidebarMsgs.value.push(t1); scrollSidebar()
  await wait(800); if (!alive()) return
  ;(t1 as any).status = 'done'
  ;(t1 as any).detail = '7 nodes'
  plan2[0].status = 'done'
  plan2[1].status = 'in_progress'
  scrollSidebar()
  await wait(300); if (!alive()) return

  const t2: InlineMsg = { kind: 'tool', tool: 'search_history', icon: 'history', status: 'running', detail: 'meetings + people referenced' }
  sidebarMsgs.value.push(t2); scrollSidebar()
  await wait(900); if (!alive()) return
  ;(t2 as any).status = 'done'
  ;(t2 as any).detail = '4 meetings, 4 people'
  plan2[1].status = 'done'
  plan2[2].status = 'in_progress'
  scrollSidebar()
  await wait(300); if (!alive()) return

  const t3: InlineMsg = { kind: 'tool', tool: 'create_base', icon: 'grid', status: 'running', detail: 'Token Cost Optimization.base' }
  sidebarMsgs.value.push(t3); scrollSidebar()
  await wait(700); if (!alive()) return

  // switch to base tab
  view.value = 'base'
  tab.value = { name: 'Token Cost Optimization.base', kind: 'base' }
  baseRowsShown.value = 0
  baseColsExtra.value = false

  for (let i = 0; i < baseRows.length; i++) {
    if (!alive()) return
    baseRowsShown.value = i + 1
    await wait(130)
  }
  await wait(250); if (!alive()) return
  baseColsExtra.value = true

  ;(t3 as any).status = 'done'
  ;(t3 as any).detail = '7 rows, 4 fields'
  plan2[2].status = 'done'
  scrollSidebar()
  await wait(500); if (!alive()) return

  sidebarMsgs.value.push({
    kind: 'text',
    text: 'Base is ready. The Meetings and People columns are pulled from your chat history and meeting notes.',
  })
  sidebarMsgs.value.push({
    kind: 'cost',
    usage: { tIn: 5120, tOut: 460, tCached: 4280, hitPct: 84, eur: 0.03 },
  })
  scrollSidebar()
  await wait(2800); if (!alive()) return
}

/* ── reset between full plays ── */
function resetAll() {
  phase.value = 'editor-solo'
  view.value = 'note'
  tab.value = { name: 'Token Cost Optimization.md', kind: 'note' }
  updatedIds.value = new Set()
  showSemantic.value = false
  selectionId.value = null
  inlineOpen.value = false
  inlineInput.value = ''
  inlineMsgs.value = []
  inlineSendHover.value = false
  inlineActiveAction.value = null
  sidebarMsgs.value = []
  sidebarInput.value = ''
  handoffMsgs.value = []
  handoffVisible.value = false
  cursorOn.value = false
  cursorClicking.value = false
  pillOn.value = false
  pillClicked.value = false
  inlineSendClicking.value = false
  canvasNodes.value = 0
  canvasEdges.value = 0
  canvasLabels.value = false
  baseRowsShown.value = 0
  baseColsExtra.value = false
}

async function runAll() {
  const myGen = ++gen
  const alive = () => gen === myGen
  while (alive()) {
    resetAll()
    await runScene1(alive); if (!alive()) return
    await runInlineRewrite(alive); if (!alive()) return
    await runInlineAddMissing(alive); if (!alive()) return
    await runHandoffToSidebar(alive); if (!alive()) return
    await runSidebarCanvas(alive); if (!alive()) return
    await runSidebarBase(alive); if (!alive()) return
    await wait(2500)
  }
}

/* ── start on scroll into view ── */
const rootEl = ref<HTMLDivElement | null>(null)
let started = false
let observer: IntersectionObserver | null = null
function kickoff() { if (!started) { started = true; void runAll() } }
onMounted(() => {
  if (!('IntersectionObserver' in window) || !rootEl.value) { kickoff(); return }
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { kickoff(); observer?.disconnect(); break }
  }, { threshold: 0.2 })
  observer.observe(rootEl.value)
})
onUnmounted(() => { gen++; clearAll(); observer?.disconnect() })

/* ── derived UI helpers ── */
/* The tail of the current selection: the last item where the selection ends.
 * That item gets the 2px bottom border so the highlight stops exactly where
 * the user's selection stops (mirroring `.agent-inline-selection-highlight`
 * which only paints ONE underline at the end of the range, not per row). */
const selectionTailId = computed(() => {
  if (selectionId.value === 'list') return strategies[strategies.length - 1].id
  return selectionId.value
})

// Ribbon stays visible from the very first frame so it's instantly
// recognizable as Obsidian -- the side toolbar is a hallmark of the app.
// (User feedback 2026-06-24: "die toolbar-anzeige links soll schon ab
// beginn sichtbar sein, perfekte simulation des fensters".)
const showRibbon = computed(() => true)
const showSidebar = computed(() => phase.value === 'sidebar-open' || phase.value === 'sidebar-opening')
const sidebarClass = computed(() => ({
  'is-opening': phase.value === 'sidebar-opening',
  'is-open': phase.value === 'sidebar-open',
}))
// Ribbon column is permanently 46px now; only the sidebar column toggles.
const gridClass = computed(() => ({
  'g-solo': !showSidebar.value,
  'g-full': showSidebar.value,
}))
</script>

<template>
  <section class="ed-section">
    <div ref="rootEl" class="ed-stage">
      <div class="ed-window" role="img" aria-label="Vault Operator running inside Obsidian">
        <div class="ed-grid" :class="gridClass">
          <!-- header row -->
          <div v-if="showRibbon" class="ed-h-ribbon"><div class="ed-traffic"><span /><span /><span /></div></div>
          <div v-else class="ed-h-ribbon solo"><div class="ed-traffic"><span /><span /><span /></div></div>

          <div class="ed-h-editor">
            <span class="ed-h-ico" v-html="icon('panelLeft')" />
            <div class="ed-tab active">
              <span class="ed-tab-ico" v-html="icon(tab.kind === 'base' ? 'grid' : tab.kind === 'canvas' ? 'canvas' : 'fileText')" />
              <span class="ed-tab-name">{{ tab.name }}</span>
              <span class="ed-tab-x" v-html="icon('x')" />
            </div>
            <span class="ed-tab-add" v-html="icon('plus')" />
            <div class="ed-h-spacer" />
            <span v-if="!showSidebar" class="ed-h-ico" v-html="icon('panelRight')" />
            <span v-else class="ed-h-ico" v-html="icon('chevronDown')" />
          </div>

          <div v-if="showSidebar" class="ed-h-vo">
            <span v-for="t in voTabs" :key="t" class="ed-h-ico" v-html="icon(t)" />
            <span class="ed-h-ico active" v-html="icon('voSquare')" />
            <div class="ed-h-spacer" />
            <span class="ed-h-ico" v-html="icon('panelRight')" />
          </div>

          <!-- body row -->
          <nav v-if="showRibbon" class="ed-ribbon">
            <span v-for="(ic, i) in ribbonIcons" :key="i" class="ed-rib-ico" v-html="icon(ic)" />
          </nav>

          <main class="ed-editor">
            <div class="ed-subbar">
              <span class="ed-nav-ico" v-html="icon('arrowLeft')" />
              <span class="ed-nav-ico" v-html="icon('arrowRight')" />
              <span class="ed-subbar-title">{{ tab.name.replace(/\.(md|canvas|base)$/, '') }}</span>
              <span class="ed-nav-ico" v-html="icon('more')" />
            </div>

            <div ref="contentEl" class="ed-content">
              <!-- NOTE VIEW -->
              <div v-if="view === 'note'" ref="noteEl" class="ed-note">
                <h1 class="ed-note-title">Token Cost Optimization</h1>

                <div class="ed-props">
                  <div class="ed-prop"><span class="ed-prop-k">tags</span>
                    <span class="ed-prop-v"><span class="ed-prop-tag">#llm-costs</span><span class="ed-prop-tag">#agents</span></span>
                  </div>
                  <div class="ed-prop"><span class="ed-prop-k">date</span><span class="ed-prop-v">2026-06-24</span></div>
                </div>

                <p class="ed-nb ed-nb-p shown">{{ introPara.text }}</p>

                <h2 class="ed-nb ed-nb-h2 shown">{{ sectionTitle }}</h2>

                <!-- strategies; the inline panel renders BETWEEN list items when open -->
                <div class="ed-strategy-list" :class="{ 'is-selected': selectionId === 'list' }">
                  <template v-for="s in strategies" :key="s.id">
                    <div
                      :ref="setStrategyEl(s.id)"
                      class="ed-strategy"
                      :class="{
                        'is-selected': selectionId === s.id || selectionId === 'list',
                        'is-selection-tail': selectionTailId === s.id,
                        'is-updated': updatedIds.has(s.id),
                      }"
                    >
                      <span class="ed-strategy-num" />
                      <div class="ed-strategy-body">
                        <span class="ed-strategy-name">{{ s.name }}.</span>
                        <span class="ed-strategy-text">{{ updatedIds.has(s.id) && s.updated ? s.updated : s.text }}</span>
                      </div>
                    </div>
                    <transition name="ed-block">
                      <div
                        v-if="inlineOpen && inlineAnchor === 'caching' && s.id === 'caching'"
                        :ref="setInlinePanelEl"
                        class="ed-inline-block agent-inline-panel agent-inline-panel--inline-block"
                      >
                        <span class="ed-inline-close" v-html="icon('x')" />
                        <div ref="inlineScroll" class="ed-inline-chat">
                          <template v-for="(m, i) in inlineMsgs" :key="i">
                            <div v-if="m.kind === 'user'" class="ed-msg user">{{ m.text }}</div>
                            <div v-else-if="m.kind === 'text'" class="ed-msg assistant"><div class="ed-msg-text">{{ m.text }}</div></div>
                            <div v-else-if="m.kind === 'plan'" class="ed-todo-box">
                              <div class="ed-todo-head"><span class="ed-todo-ico" v-html="icon('clipboard')" />Plan</div>
                              <div class="ed-todo-list">
                                <div v-for="(it, k) in m.items" :key="k" class="ed-todo-item" :class="it.status">
                                  <span class="ed-todo-bullet" v-html="icon(it.status === 'done' ? 'checkCircle' : it.status === 'in_progress' ? 'loader' : 'circle')" />
                                  <span class="ed-todo-text">{{ it.text }}</span>
                                </div>
                              </div>
                            </div>
                            <div v-else-if="m.kind === 'cost'" class="ed-cost-footer">
                              <span>{{ m.usage.tIn.toLocaleString() }} in</span><span class="ed-cost-sep">·</span>
                              <span>{{ m.usage.tOut.toLocaleString() }} out</span><span class="ed-cost-sep">·</span>
                              <span>{{ m.usage.tCached.toLocaleString() }} cached</span><span class="ed-cost-sep">·</span>
                              <span>{{ m.usage.hitPct }}% hit</span><span class="ed-cost-sep">·</span>
                              <span class="ed-cost-eur">€ {{ m.usage.eur.toFixed(2) }}</span>
                            </div>
                            <div v-else-if="m.kind === 'tool'" class="ed-tool" :class="m.status">
                              <span class="ed-tool-ico" v-html="icon(m.icon)" />
                              <span class="ed-tool-name">{{ m.tool }}</span>
                              <span class="ed-tool-detail">{{ m.detail }}</span>
                              <span v-if="m.status === 'running'" class="ed-spinner" />
                              <span v-else class="ed-tool-check" v-html="icon('checkCircle')" />
                            </div>
                          </template>
                        </div>
                        <div class="ed-inline-composer">
                          <div class="ed-input-render">
                            <span v-if="!inlineInput && !inlineTyping" class="ed-input-ph">Type your message here...</span>
                            <span v-else>{{ inlineInput }}</span>
                            <span v-if="inlineTyping" class="ed-input-caret" />
                          </div>
                          <div class="ed-input-bar">
                            <span class="ed-model">Auto <span class="ed-model-chev" v-html="icon('chevronDown')" /></span>
                            <span class="ed-bar-ico" v-html="icon('plus')" />
                            <span class="ed-bar-ico" :class="{ active: inlineActiveAction === 'lookup' }" v-html="icon('search')" />
                            <span class="ed-bar-ico" v-html="icon('more')" />
                            <div class="ed-h-spacer" />
                            <span class="ed-bar-ico ed-bar-to-sidebar" :class="{ hot: inlineSendHover, click: inlineSendClicking }" v-html="icon('sendToSidebar')" />
                            <span class="ed-send" v-html="icon('send')" />
                          </div>
                        </div>
                      </div>
                    </transition>
                  </template>
                  <transition name="ed-fade">
                    <div v-if="showSemantic" class="ed-strategy is-new">
                      <span class="ed-strategy-num" />
                      <div class="ed-strategy-body">
                        <span class="ed-strategy-name">{{ newStrategy.name }}.</span>
                        <span class="ed-strategy-text">{{ newStrategy.text }}</span>
                      </div>
                    </div>
                  </transition>
                  <transition name="ed-block">
                    <div
                      v-if="inlineOpen && inlineAnchor === 'list'"
                      :ref="setInlinePanelEl"
                      class="ed-inline-block agent-inline-panel agent-inline-panel--inline-block"
                    >
                      <span class="ed-inline-close" v-html="icon('x')" />
                      <div ref="inlineScroll" class="ed-inline-chat">
                        <template v-for="(m, i) in inlineMsgs" :key="i">
                          <div v-if="m.kind === 'user'" class="ed-msg user">{{ m.text }}</div>
                          <div v-else-if="m.kind === 'text'" class="ed-msg assistant"><div class="ed-msg-text">{{ m.text }}</div></div>
                          <div v-else-if="m.kind === 'plan'" class="ed-todo-box">
                            <div class="ed-todo-head"><span class="ed-todo-ico" v-html="icon('clipboard')" />Plan</div>
                            <div class="ed-todo-list">
                              <div v-for="(it, k) in m.items" :key="k" class="ed-todo-item" :class="it.status">
                                <span class="ed-todo-bullet" v-html="icon(it.status === 'done' ? 'checkCircle' : it.status === 'in_progress' ? 'loader' : 'circle')" />
                                <span class="ed-todo-text">{{ it.text }}</span>
                              </div>
                            </div>
                          </div>
                          <div v-else-if="m.kind === 'cost'" class="ed-cost-footer">
                            <span class="ed-cost-cell">{{ fmtK(m.usage.tIn) }} in</span>
                            <span class="ed-cost-cell">{{ fmtK(m.usage.tOut) }} out</span>
                            <span class="ed-cost-cell">{{ fmtK(m.usage.tCached) }} cached</span>
                            <span class="ed-cost-cell">{{ m.usage.hitPct }}% hit</span>
                            <span class="ed-cost-eur">€{{ m.usage.eur.toFixed(2) }}</span>
                          </div>
                          <div v-else-if="m.kind === 'tool'" class="ed-tool" :class="m.status">
                            <span class="ed-tool-ico" v-html="icon(m.icon)" />
                            <span class="ed-tool-name">{{ m.tool }}</span>
                            <span class="ed-tool-detail">{{ m.detail }}</span>
                            <span v-if="m.status === 'running'" class="ed-spinner" />
                            <span v-else class="ed-tool-check" v-html="icon('checkCircle')" />
                          </div>
                        </template>
                      </div>
                      <div class="ed-inline-composer">
                        <div class="ed-input-render">
                          <span v-if="!inlineInput && !inlineTyping" class="ed-input-ph">Type your message here...</span>
                          <span v-else>{{ inlineInput }}</span>
                          <span v-if="inlineTyping" class="ed-input-caret" />
                        </div>
                        <div class="ed-input-bar">
                          <span class="ed-model">Auto <span class="ed-model-chev" v-html="icon('chevronDown')" /></span>
                          <span class="ed-bar-ico" v-html="icon('plus')" />
                          <span class="ed-bar-ico" :class="{ active: inlineActiveAction === 'rewrite' }" v-html="icon('search')" />
                          <span class="ed-bar-ico" v-html="icon('more')" />
                          <div class="ed-h-spacer" />
                          <span class="ed-bar-ico ed-bar-to-sidebar" :class="{ hot: inlineSendHover, click: inlineSendClicking }" v-html="icon('sendToSidebar')" />
                          <span class="ed-send" v-html="icon('send')" />
                        </div>
                      </div>
                    </div>
                  </transition>
                </div>
              </div>

              <!-- CANVAS VIEW -->
              <div v-if="view === 'canvas'" class="ed-canvas">
                <svg class="ed-canvas-edges" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <line
                    v-for="(e, i) in CE"
                    :key="'e' + i"
                    :x1="edgePath(e).x1" :y1="edgePath(e).y1"
                    :x2="edgePath(e).x2" :y2="edgePath(e).y2"
                    :class="{ visible: canvasEdges > i }"
                  />
                </svg>
                <div
                  v-for="(e, i) in CE"
                  :key="'l' + i"
                  class="ed-edge-label"
                  :class="{ shown: canvasLabels && canvasEdges > i }"
                  :style="{ left: edgeMid(e).x + '%', top: edgeMid(e).y + '%' }"
                >{{ e.l }}</div>
                <div
                  v-for="(n, i) in CN"
                  :key="'n' + i"
                  class="ed-cnode"
                  :class="{ shown: canvasNodes > i, root: i === 0 }"
                  :style="{ left: n.x + '%', top: n.y + '%', width: n.w + '%', height: n.h + '%' }"
                >
                  <span class="ed-cnode-ico" v-html="icon(i === 0 ? 'sparkle' : 'fileText')" />
                  <span class="ed-cnode-label">{{ n.label }}</span>
                </div>
              </div>

              <!-- BASE VIEW -->
              <div v-if="view === 'base'" class="ed-base">
                <div class="ed-base-head">
                  <span class="ed-base-icon" v-html="icon('grid')" />
                  <span class="ed-base-title">Token Cost Optimization</span>
                  <span class="ed-base-tabs">
                    <span class="ed-base-view active">Table</span>
                    <span class="ed-base-view">Cards</span>
                  </span>
                  <div class="ed-h-spacer" />
                  <span class="ed-base-filter" v-html="icon('list')" />
                </div>
                <div class="ed-table" :class="{ wide: baseColsExtra }">
                  <div class="ed-tr ed-th">
                    <span>Name</span>
                    <span>Type</span>
                    <span :class="{ 'ed-th-fade': !baseColsExtra }">Meetings</span>
                    <span :class="{ 'ed-th-fade': !baseColsExtra }">People</span>
                  </div>
                  <div
                    v-for="(r, i) in baseRows"
                    :key="r.name"
                    class="ed-tr"
                    :class="{ shown: baseRowsShown > i }"
                  >
                    <span class="ed-td-name">
                      <span class="ed-td-ico" v-html="icon(i === 0 ? 'sparkle' : 'fileText')" />
                      <a class="ed-wikilink">{{ r.name }}</a>
                    </span>
                    <span class="ed-td-mid">
                      <span class="ed-chip">{{ r.type }}</span>
                    </span>
                    <span class="ed-td-mid" :class="{ 'ed-td-fade': !baseColsExtra }">
                      <a v-if="baseColsExtra" class="ed-wikilink ed-wikilink-meeting">{{ r.meetings }}</a>
                      <template v-else>{{ r.meetings }}</template>
                    </span>
                    <span class="ed-td-mid" :class="{ 'ed-td-fade': !baseColsExtra }">
                      <template v-if="baseColsExtra">
                        <a v-for="(p, pi) in r.people.split(', ')" :key="p" class="ed-wikilink ed-wikilink-person">{{ p }}<span v-if="pi < r.people.split(', ').length - 1">, </span></a>
                      </template>
                      <template v-else>{{ r.people }}</template>
                    </span>
                  </div>
                </div>
              </div>

              <!-- inline chat panel is rendered as a block element inside the strategy list above (CM6 block-widget pattern) -->

              <!-- Selection-affordance pill (wand-sparkles). After the user
                   finishes selecting text this little wand pops up next to
                   the selection; clicking it opens the inline chat. Mirrors
                   .agent-inline-action-pill (FEAT-33-12). -->
              <div
                class="ed-action-pill"
                :class="{ shown: pillOn, clicked: pillClicked }"
                :style="{ transform: `translate(${pillX}px, ${pillY}px)` }"
                v-html="icon('wandSparkles')"
              />

              <!-- Animated mouse cursor that shows the user selecting text -->
              <div
                class="ed-cursor"
                :class="{ shown: cursorOn, clicking: cursorClicking }"
                :style="{ transform: `translate(${cursorX}px, ${cursorY}px)` }"
                v-html="icon('mousePointer')"
              />
            </div>
          </main>

          <aside v-if="showSidebar" class="ed-vo" :class="sidebarClass">
            <div class="ed-vo-sub">
              <div class="ed-vo-brand"><span class="ed-vo-slash">/</span>Vault Operator</div>
              <div class="ed-vo-actions">
                <span class="ed-vo-ico" v-html="icon('stethoscope')" />
                <span class="ed-vo-ico" v-html="icon('settings')" />
                <span class="ed-vo-ico" v-html="icon('history')" />
                <span class="ed-vo-ico" v-html="icon('newChat')" />
              </div>
            </div>

            <div ref="chatScroll" class="ed-vo-chat">
              <transition name="ed-handoff">
                <div v-if="handoffVisible" class="ed-handoff-card">
                  <div class="ed-handoff-head">
                    <span class="ed-handoff-ico" v-html="icon('sendToSidebar')" />
                    <span>Continued from inline chat</span>
                  </div>
                  <div class="ed-handoff-body">
                    <template v-for="(h, hi) in handoffMsgs" :key="hi">
                      <div v-if="h.kind === 'user'" class="ed-msg user">{{ h.text }}</div>
                      <div v-else-if="h.kind === 'text'" class="ed-msg assistant"><div class="ed-msg-text">{{ h.text }}</div></div>
                      <div v-else-if="h.kind === 'tool'" class="ed-tool done">
                        <span class="ed-tool-ico" v-html="icon(h.icon)" />
                        <span class="ed-tool-name">{{ h.tool }}</span>
                        <span class="ed-tool-detail">{{ h.detail }}</span>
                        <span class="ed-tool-check" v-html="icon('checkCircle')" />
                      </div>
                    </template>
                  </div>
                </div>
              </transition>
              <template v-for="(b, i) in sidebarMsgs" :key="i">
                <div v-if="b.kind === 'user'" class="ed-msg user">{{ b.text }}</div>
                <div v-else-if="b.kind === 'text'" class="ed-msg assistant"><div class="ed-msg-text">{{ b.text }}</div></div>
                <div v-else-if="b.kind === 'plan'" class="ed-todo-box">
                  <div class="ed-todo-head"><span class="ed-todo-ico" v-html="icon('clipboard')" />Plan</div>
                  <div class="ed-todo-list">
                    <div v-for="(it, k) in b.items" :key="k" class="ed-todo-item" :class="it.status">
                      <span class="ed-todo-bullet" v-html="icon(it.status === 'done' ? 'checkCircle' : it.status === 'in_progress' ? 'loader' : 'circle')" />
                      <span class="ed-todo-text">{{ it.text }}</span>
                    </div>
                  </div>
                </div>
                <div v-else-if="b.kind === 'cost'" class="ed-cost-footer">
                  <span>{{ b.usage.tIn.toLocaleString() }} in</span><span class="ed-cost-sep">·</span>
                  <span>{{ b.usage.tOut.toLocaleString() }} out</span><span class="ed-cost-sep">·</span>
                  <span>{{ b.usage.tCached.toLocaleString() }} cached</span><span class="ed-cost-sep">·</span>
                  <span>{{ b.usage.hitPct }}% hit</span><span class="ed-cost-sep">·</span>
                  <span class="ed-cost-eur">€ {{ b.usage.eur.toFixed(2) }}</span>
                </div>
                <div v-else-if="b.kind === 'tool'" class="ed-tool" :class="b.status">
                  <span class="ed-tool-ico" v-html="icon(b.icon)" />
                  <span class="ed-tool-name">{{ b.tool }}</span>
                  <span class="ed-tool-detail">{{ b.detail }}</span>
                  <span v-if="b.status === 'running'" class="ed-spinner" />
                  <span v-else class="ed-tool-check" v-html="icon('checkCircle')" />
                </div>
              </template>
            </div>

            <div class="ed-vo-compose">
              <div class="ed-input-box">
                <div class="ed-input-render">
                  <span v-if="!sidebarInput && !sidebarTyping" class="ed-input-ph">Type your message here...</span>
                  <span v-else>{{ sidebarInput }}</span>
                  <span v-if="sidebarTyping" class="ed-input-caret" />
                </div>
                <div class="ed-input-bar">
                  <span class="ed-model">Auto <span class="ed-model-chev" v-html="icon('chevronDown')" /></span>
                  <span class="ed-bar-ico" v-html="icon('plus')" />
                  <span class="ed-bar-ico" v-html="icon('more')" />
                  <div class="ed-h-spacer" />
                  <span class="ed-send" v-html="icon('send')" />
                </div>
              </div>
              <p class="ed-disclaimer">Vault Operator is AI and can make mistakes. Please double-check responses.</p>
            </div>

            <span class="ed-status-dot" v-html="icon('checkCircle')" />
          </aside>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ed-section { width: 100%; max-width: 1080px; margin: 0 auto; padding: 2rem 1.5rem 3rem; }

.ed-stage {
  border-radius: 14px;
  padding: clamp(10px, 2vw, 22px);
  background: radial-gradient(120% 90% at 50% -20%, rgba(124, 58, 237, 0.12), transparent 55%), #f4f4f6;
  border: 1px solid #e2e2e6;
}
/* Dark overrides live in a separate non-scoped <style> block below. */

/* Theme-adaptive variables: the demo follows the VitePress theme (light + dark).
   The README GIF is captured in light mode only (recording forces light). */
.ed-window {
  --ed-bg: #ffffff;
  --ed-bg-soft: #f6f6f8;
  --ed-bg-sunken: #ececef;
  --ed-divider: #e1e1e6;
  --ed-divider-strong: #cdcdd2;
  --ed-text-1: #1f2024;
  --ed-text-2: #565862;
  --ed-text-3: #8c8e98;
  --ed-brand: #7c5cff;
  --ed-brand-soft: rgba(124, 92, 255, 0.12);
  --ed-blue: #5b81e0;
  --ed-green: #10b981;
  --ed-yellow: #f5b942;
  --ed-selection: rgba(124, 92, 255, 0.16);

  border: 1px solid var(--ed-divider);
  border-radius: 10px;
  overflow: hidden;
  background: var(--ed-bg);
  box-shadow: 0 14px 40px rgba(20, 25, 45, 0.12), 0 3px 10px rgba(20, 25, 45, 0.06);
  color: var(--ed-text-1);
}
.ed-window * { color: inherit; }

/* responsive grid; phases collapse columns. 4:3 (width/height) at 880px = 660px.
   minmax(0, 1fr) on the row is critical -- without the `0` minimum, CSS Grid
   lets the row grow past the grid's own height whenever a child has
   min-content that wants more space (which the inline panel + note do).
   That breaks .ed-note's overflow:auto because .ed-note then becomes as
   tall as its content and never needs to scroll. */
.ed-grid {
  display: grid;
  grid-template-rows: 40px minmax(0, 1fr);
  height: 660px;
  transition: grid-template-columns 0.45s ease;
}
.ed-grid.g-solo {
  /* Ribbon column visible from the start (instant Obsidian recognition);
     sidebar column collapsed. */
  grid-template-columns: 46px 1fr 0;
  grid-template-areas: "hr he hv" "rb ed vo";
}
.ed-grid.g-full {
  grid-template-columns: 46px 2fr 1fr;
  grid-template-areas: "hr he hv" "rb ed vo";
}
:deep(.ed-window svg) { width: 100%; height: 100%; display: block; }

/* header */
.ed-h-ribbon { grid-area: hr; display: flex; align-items: center; padding-left: 4px; background: var(--ed-bg-soft); border-bottom: 1px solid var(--ed-divider); overflow: hidden; }
.ed-h-ribbon.solo { padding-left: 12px; }
.ed-traffic { display: flex; gap: 5px; }
.ed-traffic span { width: 10px; height: 10px; border-radius: 50%; }
.ed-traffic span:nth-child(1) { background: #ff5f57; }
.ed-traffic span:nth-child(2) { background: #febc2e; }
.ed-traffic span:nth-child(3) { background: #28c840; }

.ed-h-editor { grid-area: he; display: flex; align-items: stretch; background: var(--ed-bg-soft); border-bottom: 1px solid var(--ed-divider); padding-left: 0.5rem; }
.g-full .ed-h-editor { border-right: 1px solid var(--ed-divider); }
.ed-h-ico { width: 17px; height: 17px; color: var(--ed-text-3); flex-shrink: 0; align-self: center; }
.ed-h-ico.active { color: var(--ed-text-1); }
.ed-h-spacer { flex: 1; }
.ed-tab { display: flex; align-items: center; gap: 0.4rem; margin-left: 0.5rem; padding: 0 0.5rem 0 0.7rem; font-size: 0.66rem; color: var(--ed-text-1); background: var(--ed-bg); border-radius: 6px 6px 0 0; max-width: 260px; white-space: nowrap; position: relative; align-self: flex-end; height: calc(100% - 6px); }
.ed-tab.active::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--ed-brand); border-radius: 2px; }
.ed-tab-ico { width: 13px; height: 13px; flex-shrink: 0; color: var(--ed-brand); }
.ed-tab-name { overflow: hidden; text-overflow: ellipsis; }
.ed-tab-x { width: 13px; height: 13px; opacity: 0.55; flex-shrink: 0; }
.ed-tab-add { width: 15px; height: 15px; align-self: center; margin: 0 0.6rem; color: var(--ed-text-3); }

.ed-h-vo { grid-area: hv; display: flex; align-items: center; gap: 0.7rem; padding: 0 0.7rem; background: var(--ed-bg-soft); border-bottom: 1px solid var(--ed-divider); }

/* ribbon */
.ed-ribbon { grid-area: rb; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 0.6rem 0; background: var(--ed-bg-soft); border-right: 1px solid var(--ed-divider); overflow: hidden; }
.ed-rib-ico { width: 18px; height: 18px; color: var(--ed-text-3); opacity: 0.8; flex-shrink: 0; }

/* editor */
.ed-editor { grid-area: ed; display: flex; flex-direction: column; min-width: 0; background: var(--ed-bg); }
.g-full .ed-editor { border-right: 1px solid var(--ed-divider); }
.ed-subbar { display: flex; align-items: center; gap: 0.55rem; padding: 0 0.85rem; height: 40px; flex-shrink: 0; }
.ed-nav-ico { width: 15px; height: 15px; color: var(--ed-text-3); }
.ed-subbar-title { flex: 1; text-align: center; font-size: 0.68rem; color: var(--ed-text-2); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ed-content { flex: 1; min-height: 0; overflow: hidden; position: relative; background: var(--ed-bg); }

/* NOTE */
.ed-note { height: 100%; overflow-y: auto; padding: 1.6rem 2.2rem 2rem; color: var(--ed-text-1); }
.ed-note-title { font-size: 1.4rem; font-weight: 700; margin: 0 0 0.7rem; }
.ed-props { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.4rem 0 0.7rem; border-bottom: 1px solid var(--ed-divider); margin-bottom: 1rem; }
.ed-prop { display: grid; grid-template-columns: 60px 1fr; align-items: center; font-size: 0.68rem; }
.ed-prop-k { color: var(--ed-text-3); }
.ed-prop-v { color: var(--ed-text-1); display: flex; flex-wrap: wrap; gap: 0.3rem; }
.ed-prop-tag { font-size: 0.6rem; color: var(--ed-brand); background: var(--ed-brand-soft); padding: 1px 8px; border-radius: 9px; }

.ed-nb { opacity: 1; }
.ed-nb-h2 { font-size: 0.92rem; font-weight: 600; color: var(--ed-text-1); margin: 1.1rem 0 0.4rem; }
.ed-nb-p { font-size: 0.8rem; color: var(--ed-text-2); margin: 0.25rem 0; line-height: 1.55; }

.ed-strategy-list { margin: 0.2rem 0; padding: 0.15rem 0; border-radius: 6px; transition: background 0.3s; }
.ed-strategy-list.is-selected { background: var(--ed-selection); }
.ed-strategy {
  display: grid; grid-template-columns: 18px 1fr; gap: 0.55rem;
  padding: 0.4rem 0.55rem; border-radius: 5px;
  transition: background 0.3s, box-shadow 0.4s;
  position: relative;
}
.ed-strategy.is-selected { background: var(--ed-selection); }
.ed-strategy.is-updated { animation: shimmer 1.1s ease-out; }
.ed-strategy.is-new { background: rgba(16, 185, 129, 0.10); box-shadow: inset 0 0 0 1px rgba(16, 185, 129, 0.25); }
.ed-strategy-num { width: 5px; height: 5px; border-radius: 50%; background: var(--ed-text-3); margin: 0.55em 0 0 0.4em; flex-shrink: 0; }
.ed-strategy-body { font-size: 0.8rem; line-height: 1.55; color: var(--ed-text-2); }
.ed-strategy-name { font-weight: 600; color: var(--ed-text-1); margin-right: 0.3em; }
@keyframes shimmer { 0% { background: rgba(124, 92, 255, 0.20); } 100% { background: transparent; } }

.ed-fade-enter-active, .ed-fade-leave-active { transition: opacity 0.45s, transform 0.45s; }
.ed-fade-enter-from, .ed-fade-leave-to { opacity: 0; transform: translateY(4px); }

/* INLINE CHAT PANEL -- inline-block widget that pushes surrounding text down.
   Mirrors styles.css `.agent-inline-panel--inline-block`: 2px solid faint
   border, 8px radius, 1.5em vertical margin, full width, soft shadow. */
.ed-inline-block {
  position: relative;
  display: block;
  width: 100%;
  margin: 1.2em 0;
  background: var(--ed-bg);
  border: 2px solid var(--ed-divider-strong);
  border-radius: 8px;
  box-shadow: 0 2px 14px rgba(20, 25, 45, 0.12);
  overflow: visible;
}
.ed-inline-block .ed-inline-close {
  position: absolute;
  top: 6px;
  right: 8px;
  width: 14px;
  height: 14px;
  color: var(--ed-text-3);
  cursor: pointer;
  z-index: 2;
}

.ed-inline-chat {
  max-height: 14rem;
  overflow-y: auto;
  padding: 0.7rem 0.85rem 0.5rem;
  display: flex; flex-direction: column; gap: 0.5rem;
}
.ed-inline-chat:empty { padding-top: 0; padding-bottom: 0; }

.ed-inline-composer {
  border-top: 1px solid var(--ed-divider);
  padding: 0.65rem 0.8rem 0.55rem;
  background: var(--ed-bg);
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
}
.ed-inline-composer .ed-input-render {
  min-height: 28px;
  font-size: 0.74rem;
  line-height: 1.5;
  color: var(--ed-text-1);
  word-break: break-word;
}
.ed-inline-composer .ed-input-bar { margin-top: 0.45rem; }

/* block-enter: simulate CM6's block-widget reveal (push surrounding text down) */
.ed-block-enter-active, .ed-block-leave-active {
  transition: opacity 0.35s ease, max-height 0.4s ease, margin 0.35s ease, padding 0.35s ease, transform 0.35s ease;
  overflow: hidden;
}
.ed-block-enter-from, .ed-block-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
  margin-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
  transform: translateY(-4px);
}
.ed-block-enter-to, .ed-block-leave-from {
  opacity: 1;
  max-height: 28rem;
}

/* Selection highlight: tight to the text glyphs (background) AND an
   underline that follows the text wrap. NO row-level border -- the user
   wants this to read like a real browser text selection. The highlight
   is applied to the inline <span>s so it hugs the characters.
   box-decoration-break: clone keeps multi-line wraps continuous. */
.ed-strategy-list.is-selected { background: transparent; }
.ed-strategy.is-selected { background: transparent; }
.ed-strategy.is-selected .ed-strategy-name,
.ed-strategy.is-selected .ed-strategy-text {
  background-color: var(--ed-selection);
  text-decoration: underline;
  text-decoration-color: var(--ed-brand);
  text-decoration-thickness: 1.5px;
  text-underline-offset: 2px;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  padding: 1px 2px;
  margin: 0 -2px;
}

/* ANIMATED MOUSE CURSOR */
.ed-cursor {
  position: absolute;
  top: 0; left: 0;
  width: 18px;
  height: 22px;
  pointer-events: none;
  z-index: 200;
  opacity: 0;
  transform-origin: 4px 4px;
  transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease;
  filter: drop-shadow(0 1px 1.5px rgba(0,0,0,0.35));
}
.ed-cursor.shown { opacity: 1; }
.ed-cursor.clicking {
  filter: drop-shadow(0 0 2px rgba(124, 92, 255, 0.6)) drop-shadow(0 1px 1.5px rgba(0,0,0,0.35));
}
.ed-cursor :deep(svg) { width: 18px; height: 22px; display: block; }

/* SELECTION-AFFORDANCE PILL (wand-sparkles).
   Mirrors `.agent-inline-action-pill` in styles.css:7692:
   chromeless 22px button in the accent colour that sits above-right
   of a settled selection. */
.ed-action-pill {
  position: absolute;
  top: 0; left: 0;
  width: 22px;
  height: 22px;
  pointer-events: none;
  z-index: 190;
  color: var(--ed-brand);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform-origin: 11px 11px;
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.18s ease;
  filter: drop-shadow(0 1px 2px rgba(124, 92, 255, 0.35));
}
.ed-action-pill.shown { opacity: 1; }
.ed-action-pill.clicked {
  /* Combine the position translate with a quick scale-down click effect.
     Vue overrides the inline transform from the style binding, so we
     fake the click feedback via the filter (glow ring) + a subtle
     animation on the SVG instead. */
  filter: drop-shadow(0 0 5px rgba(124, 92, 255, 0.7));
}
.ed-action-pill.clicked :deep(svg) {
  animation: edPillClick 220ms ease-out;
}
@keyframes edPillClick {
  0% { transform: scale(1); }
  50% { transform: scale(0.78); }
  100% { transform: scale(1.06); }
}
.ed-action-pill :deep(svg) {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 1.9;
  fill: none;
  display: block;
}

/* Send-to-sidebar button click feedback */
.ed-bar-ico.ed-bar-to-sidebar.click {
  transform: scale(0.85);
  background: var(--ed-brand-soft);
  color: var(--ed-brand);
  box-shadow: 0 0 0 2px rgba(124, 92, 255, 0.35);
  transition: transform 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
}

/* TODO BOX (mirrors `.agent-todo-box` from styles.css; plan rendering
   that the sidebar uses to show the agent's task list with checkboxes) */
.ed-todo-box {
  align-self: stretch;
  background: var(--ed-bg-soft);
  border: 1px solid var(--ed-divider);
  border-radius: 10px;
  padding: 0.55rem 0.7rem 0.6rem;
  animation: msgIn 0.3s ease-out;
}
.ed-todo-head {
  display: flex; align-items: center; gap: 0.4rem;
  font-size: 0.6rem; font-weight: 700;
  letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--ed-text-3);
  margin-bottom: 0.45rem;
}
.ed-todo-ico { width: 13px; height: 13px; color: var(--ed-brand); }
.ed-todo-list { display: flex; flex-direction: column; gap: 0.28rem; }
.ed-todo-item {
  display: grid; grid-template-columns: 14px 1fr; align-items: flex-start; gap: 0.5rem;
  font-size: 0.72rem;
  color: var(--ed-text-2);
}
.ed-todo-bullet { width: 14px; height: 14px; flex-shrink: 0; margin-top: 1px; color: var(--ed-text-3); }
.ed-todo-item.done .ed-todo-bullet { color: var(--ed-green); }
.ed-todo-item.in_progress .ed-todo-bullet { color: var(--ed-brand); animation: spin 1.2s linear infinite; }
.ed-todo-item.done .ed-todo-text { color: var(--ed-text-3); text-decoration: line-through; text-decoration-color: var(--ed-divider-strong); }
.ed-todo-item.in_progress .ed-todo-text { color: var(--ed-text-1); font-weight: 500; }
.ed-todo-text { line-height: 1.4; }

/* COST FOOTER -- mirrors TaskMonitor.onUsage footer line. The real
   plugin renders this as plain footer text inside `.message-footer`
   (styles.css:1490 "Token usage footer"), no card chrome at all. */
.ed-cost-footer {
  align-self: stretch;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 0.55rem;
  row-gap: 0.15rem;
  padding: 0.15rem 0.1rem 0;
  font-family: var(--vp-font-family-mono, ui-monospace, "SF Mono", monospace);
  font-size: 0.6rem;
  color: var(--ed-text-3);
  background: transparent;
  border: none;
  border-radius: 0;
  animation: msgIn 0.25s ease-out;
}
.ed-cost-cell { white-space: nowrap; }
.ed-cost-cell + .ed-cost-cell::before {
  content: "·";
  margin-right: 0.45rem;
  color: var(--ed-divider-strong);
}
.ed-cost-eur { color: var(--ed-text-1); font-weight: 600; white-space: nowrap; }
.ed-cost-cell + .ed-cost-eur::before {
  content: "·";
  margin-right: 0.45rem;
  color: var(--ed-divider-strong);
  font-weight: 400;
}

/* HANDOFF CARD: shows the transferred inline conversation as a single
   collapsed card at the top of the sidebar (so the user actually sees
   their context move from inline to sidebar). */
.ed-handoff-card {
  margin: 0.3rem 0 0.6rem;
  border: 1px dashed var(--ed-divider-strong);
  border-radius: 10px;
  background: linear-gradient(180deg, var(--ed-brand-soft), transparent 60%);
  padding: 0.4rem 0.55rem 0.5rem;
}
.ed-handoff-head {
  display: flex; align-items: center; gap: 0.35rem;
  font-size: 0.6rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--ed-brand); margin-bottom: 0.4rem;
}
.ed-handoff-ico { width: 12px; height: 12px; }
.ed-handoff-body { display: flex; flex-direction: column; gap: 0.4rem; }
.ed-handoff-body .ed-msg { font-size: 0.66rem; }
.ed-handoff-body .ed-tool { font-size: 0.62rem; padding: 0.25rem 0.45rem; }
.ed-handoff-enter-active { transition: opacity 0.45s ease, transform 0.45s ease, max-height 0.45s ease; overflow: hidden; }
.ed-handoff-enter-from { opacity: 0; transform: translateY(-8px); max-height: 0; }
.ed-handoff-enter-to { opacity: 1; transform: translateY(0); max-height: 30rem; }

/* WIKILINKS in Base (reading-view style: dotted underline + accent
   colour, hover -> solid; meetings + people pills get the same look) */
.ed-wikilink {
  color: var(--ed-brand);
  text-decoration: underline;
  text-decoration-style: dashed;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  cursor: pointer;
}
.ed-wikilink-meeting, .ed-wikilink-person {
  text-decoration-style: solid;
}

/* CANVAS */
.ed-canvas {
  height: 100%; position: relative; overflow: hidden;
  background:
    radial-gradient(circle, var(--ed-divider) 1px, transparent 1.4px) 0 0 / 22px 22px,
    var(--ed-bg);
}
.ed-canvas-edges { position: absolute; inset: 0; }
.ed-canvas-edges line { stroke: var(--ed-text-3); stroke-width: 0.35; opacity: 0; transition: opacity 0.35s; }
.ed-canvas-edges line.visible { opacity: 0.55; }

.ed-cnode {
  position: absolute; transform: translate(-50%, -50%) scale(0.85);
  display: flex; align-items: center; justify-content: center; gap: 0.35rem;
  background: var(--ed-bg); border: 1px solid var(--ed-divider-strong);
  border-radius: 7px; padding: 0.35rem 0.55rem; font-size: 0.64rem; font-weight: 500;
  color: var(--ed-text-1); white-space: nowrap; box-shadow: 0 2px 8px rgba(20, 25, 45, 0.10);
  opacity: 0; transition: opacity 0.35s, transform 0.35s; z-index: 2;
  box-sizing: border-box;
}
.ed-cnode.shown { opacity: 1; transform: translate(-50%, -50%) scale(1); }
.ed-cnode.root {
  background: var(--ed-brand-soft); border-color: var(--ed-brand);
  color: var(--ed-brand); font-weight: 700; font-size: 0.72rem;
}
.ed-cnode-ico { width: 12px; height: 12px; color: var(--ed-text-3); flex-shrink: 0; }
.ed-cnode.root .ed-cnode-ico { color: var(--ed-brand); }
.ed-cnode-label { overflow: hidden; text-overflow: ellipsis; }

.ed-edge-label {
  position: absolute; transform: translate(-50%, -50%); z-index: 3;
  font-size: 0.52rem; color: var(--ed-text-2);
  background: var(--ed-bg); padding: 0 4px; border-radius: 3px;
  opacity: 0; transition: opacity 0.4s; white-space: nowrap;
  border: 1px solid var(--ed-divider);
}
.ed-edge-label.shown { opacity: 0.95; }

/* BASE */
.ed-base { height: 100%; overflow-y: auto; padding: 0.9rem 1.1rem; }
.ed-base-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.85rem; }
.ed-base-icon { width: 17px; height: 17px; color: var(--ed-brand); }
.ed-base-title { font-size: 0.95rem; font-weight: 700; }
.ed-base-tabs { display: inline-flex; gap: 0.2rem; margin-left: 0.5rem; }
.ed-base-view { font-size: 0.6rem; color: var(--ed-text-3); padding: 2px 8px; border-radius: 5px; }
.ed-base-view.active { background: var(--ed-bg-soft); color: var(--ed-text-1); border: 1px solid var(--ed-divider); }
.ed-base-filter { width: 15px; height: 15px; color: var(--ed-text-3); }

.ed-table { border: 1px solid var(--ed-divider); border-radius: 8px; overflow: hidden; transition: width 0.4s; }
.ed-tr {
  display: grid;
  grid-template-columns: 1.4fr 0.7fr 1.2fr 1.2fr;
  align-items: center;
  border-bottom: 1px solid var(--ed-divider);
  font-size: 0.68rem;
  opacity: 0; transform: translateY(4px);
  transition: opacity 0.3s, transform 0.3s;
}
.ed-tr > span { padding: 0.45rem 0.65rem; border-right: 1px solid var(--ed-divider); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ed-tr > span:last-child { border-right: none; }
.ed-tr.shown { opacity: 1; transform: translateY(0); }
.ed-tr:last-child { border-bottom: none; }
.ed-th { background: var(--ed-bg-soft); font-weight: 600; font-size: 0.56rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ed-text-3); opacity: 1; transform: none; }
.ed-th-fade { color: var(--ed-text-3); opacity: 0.45; transition: opacity 0.4s; }
.ed-td-name { display: flex; align-items: center; gap: 0.4rem; color: var(--ed-blue); font-weight: 500; }
.ed-td-ico { width: 13px; height: 13px; color: var(--ed-text-3); flex-shrink: 0; }
.ed-td-mid { color: var(--ed-text-2); display: flex; align-items: center; gap: 0.3rem; }
.ed-td-fade { color: var(--ed-text-3); opacity: 0.35; transition: opacity 0.4s; }
.ed-chip { font-size: 0.58rem; color: var(--ed-brand); background: var(--ed-brand-soft); padding: 1px 7px; border-radius: 4px; }

/* SIDEBAR */
.ed-vo { grid-area: vo; position: relative; display: flex; flex-direction: column; min-height: 0; background: var(--ed-bg); border-left: 1px solid var(--ed-divider); transform: translateX(0); transition: transform 0.45s ease; }
.ed-vo.is-opening { transform: translateX(20%); }
.ed-vo.is-open { transform: translateX(0); }
.ed-vo-sub { display: flex; align-items: center; height: 40px; padding: 0 0.6rem 0 0.85rem; flex-shrink: 0; border-bottom: 1px solid var(--ed-divider); }
.ed-vo-brand { font-family: var(--vp-font-family-mono, ui-monospace, "SF Mono", monospace); font-size: 0.8rem; font-weight: 700; color: var(--ed-text-1); }
.ed-vo-slash { color: var(--ed-text-3); margin-right: 0.4rem; font-weight: 400; }
.ed-vo-actions { display: flex; align-items: center; gap: 0.7rem; margin-left: auto; }
.ed-vo-ico { width: 16px; height: 16px; color: var(--ed-text-3); }

.ed-vo-chat { flex: 1; min-height: 0; overflow-y: auto; padding: 0.9rem 0.85rem 0.5rem; display: flex; flex-direction: column; gap: 0.6rem; }

.ed-msg { font-size: 0.7rem; line-height: 1.55; animation: msgIn 0.3s ease-out; max-width: 92%; }
@keyframes msgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.ed-msg.user { align-self: flex-end; background: var(--ed-brand-soft); color: var(--ed-text-1); padding: 0.5rem 0.7rem; border-radius: 11px 11px 3px 11px; }
.ed-msg.assistant { align-self: flex-start; }
.ed-msg.assistant .ed-msg-text { background: var(--ed-bg-soft); border: 1px solid var(--ed-divider); padding: 0.5rem 0.7rem; border-radius: 11px 11px 11px 3px; display: inline-block; color: var(--ed-text-1); }

.ed-tool { align-self: stretch; display: grid; grid-template-columns: 15px auto 1fr auto; align-items: center; gap: 0.45rem; background: var(--ed-bg-soft); border: 1px solid var(--ed-divider); padding: 0.38rem 0.55rem; border-radius: 8px; font-family: var(--vp-font-family-mono, ui-monospace, "SF Mono", monospace); font-size: 0.6rem; animation: msgIn 0.25s ease-out; }
.ed-tool.done { border-color: rgba(124, 92, 255, 0.25); }
.ed-tool-ico { width: 13px; height: 13px; color: var(--ed-brand); }
.ed-tool.running .ed-tool-ico { animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
.ed-tool-name { font-weight: 600; color: var(--ed-text-1); }
.ed-tool-detail { color: var(--ed-text-3); font-size: 0.58rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ed-spinner { width: 11px; height: 11px; border: 1.5px solid var(--ed-divider); border-top-color: var(--ed-brand); border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.ed-tool-check { width: 12px; height: 12px; color: var(--ed-green); }

.ed-vo-compose { padding: 0.6rem 0.7rem 0.35rem; flex-shrink: 0; }
.ed-input-box { border: 1px solid var(--ed-divider-strong); border-radius: 12px; background: var(--ed-bg); padding: 0.55rem 0.65rem 0.45rem; }
.ed-input-render { min-height: 28px; font-size: 0.72rem; line-height: 1.45; color: var(--ed-text-1); word-break: break-word; }
.ed-input-ph { color: var(--ed-text-3); }
.ed-input-caret { display: inline-block; width: 2px; height: 1em; background: var(--ed-brand); vertical-align: text-bottom; margin-left: 1px; animation: caretBlink 0.8s step-end infinite; }
@keyframes caretBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
.ed-input-bar { display: flex; align-items: center; gap: 0.55rem; margin-top: 0.4rem; }
.ed-model { display: inline-flex; align-items: center; gap: 0.2rem; font-size: 0.64rem; color: var(--ed-text-2); font-weight: 500; }
.ed-model-chev { width: 12px; height: 12px; color: var(--ed-text-3); }
.ed-bar-ico { width: 17px; height: 17px; color: var(--ed-text-3); transition: color 0.2s, background 0.2s; border-radius: 5px; padding: 1px; box-sizing: content-box; }
.ed-bar-ico.active { color: var(--ed-brand); background: var(--ed-brand-soft); }
.ed-bar-ico.ed-bar-to-sidebar { color: var(--ed-text-2); }
.ed-bar-ico.ed-bar-to-sidebar.hot {
  color: var(--ed-brand);
  background: var(--ed-brand-soft);
  box-shadow: 0 0 0 2px rgba(124, 92, 255, 0.25);
}
.ed-send { width: 17px; height: 17px; color: var(--ed-blue); border: 1px solid var(--ed-divider); border-radius: 6px; padding: 4px; box-sizing: content-box; }
.ed-disclaimer { text-align: center; font-size: 0.58rem; color: var(--ed-text-3); margin: 0.5rem 0 0.3rem; padding: 0 22px; line-height: 1.4; }
.ed-status-dot { position: absolute; right: 0.6rem; bottom: 0.5rem; width: 16px; height: 16px; color: var(--ed-green); }

/* responsive */
@media (max-width: 880px) {
  .ed-grid.g-full { grid-template-columns: 46px 1.4fr 1fr; }
}
@media (max-width: 680px) {
  .ed-section { padding: 1rem 0.5rem 3rem; }
  .ed-stage { padding: 10px; border-radius: 12px; }
  .ed-grid, .ed-grid.g-solo, .ed-grid.g-full {
    grid-template-columns: 1fr;
    grid-template-rows: 40px 1fr;
    grid-template-areas: "he" "ed";
    height: 560px;
  }
  .ed-ribbon, .ed-h-ribbon, .ed-h-vo, .ed-vo { display: none; }
}
</style>

<!-- Dark-mode overrides for the website. The README GIF is captured in light mode only. -->
<style>
.dark .ed-stage {
  background: radial-gradient(120% 90% at 50% -20%, rgba(124, 58, 237, 0.22), transparent 55%), #161618;
  border-color: #2a2a2e;
}
.dark .ed-window {
  --ed-bg: #1b1b1f;
  --ed-bg-soft: #232328;
  --ed-bg-sunken: #18181b;
  --ed-divider: #2e2e33;
  --ed-divider-strong: #3a3a40;
  --ed-text-1: #ecedee;
  --ed-text-2: #b4b6bb;
  --ed-text-3: #818389;
  --ed-brand: #9c84ff;
  --ed-brand-soft: rgba(156, 132, 255, 0.18);
  --ed-blue: #7aa0ff;
  --ed-green: #34d399;
  --ed-selection: rgba(156, 132, 255, 0.22);

  border-color: var(--ed-divider);
  box-shadow: 0 14px 48px rgba(0, 0, 0, 0.55), 0 3px 10px rgba(0, 0, 0, 0.35);
}
</style>
