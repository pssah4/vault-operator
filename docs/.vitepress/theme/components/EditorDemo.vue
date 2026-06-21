<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

/* ── Inline Lucide-style icons (Obsidian ships Lucide) ── */
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
}
function icon(name: string): string { return ICONS[name] || '' }

/* ── ribbon (file explorer removed per request) ── */
const ribbonIcons = [
  'git', 'grid', 'files', 'terminal', 'mic', 'panelLeft', 'tree', 'chart',
  'printer', 'monitor', 'search', 'fingerprint', 'image', 'wrench', 'calendar',
  'checkSquare', 'list', 'columns', 'pen',
]
const voTabs = ['gitFork', 'link', 'tag', 'list']

/* ── scene model (replaces the hero typewriter; cycles all questions) ── */
interface PlanStep { text: string; done: boolean }
interface ToolDef { tool: string; icon: string; running: string; done: string }
interface Scene {
  q: string
  intro: string
  plan: string[]
  tools: ToolDef[]
  artifact: any
  outro: string
  tab: { name: string; kind: string }
}

const scenes: Scene[] = [
  {
    q: 'Find all notes related to @AgenticAI and create a Base.',
    intro: 'On it. Searching the vault, then collecting the matches into a Base.',
    plan: ['Search the vault for AgenticAI', 'Collect the related notes', 'Create a Base from the matches'],
    tools: [
      { tool: 'semantic_search', icon: 'search', running: 'query: "AgenticAI"', done: '7 notes matched' },
      { tool: 'create_base', icon: 'grid', running: 'AgenticAI.base', done: '7 rows · 3 fields' },
    ],
    artifact: {
      type: 'base', title: 'AgenticAI', view: 'Table',
      columns: ['Name', 'Tags', 'Modified'],
      rows: [
        ['AgenticAI', 'agentic-ai', '2d ago'],
        ['Tool calling', 'agentic-ai, tools', '4d ago'],
        ['Memory shaping', 'agentic-ai, memory', '1w ago'],
        ['RAG patterns', 'agentic-ai, rag', '1w ago'],
        ['Skill discovery', 'agentic-ai, skills', '3d ago'],
        ['Planning loops', 'agentic-ai, planning', '5d ago'],
        ['Agent evaluation', 'agentic-ai, eval', '6d ago'],
      ],
    },
    outro: 'Created AgenticAI.base with the 7 related notes.',
    tab: { name: 'AgenticAI.base', kind: 'base' },
  },
  {
    q: 'Create a Canvas based on this Base that shows the relationships between the notes.',
    intro: 'Reading the Base and laying the notes out on a canvas.',
    plan: ['Read AgenticAI.base', 'Compute the note relationships', 'Lay out and save the canvas'],
    tools: [
      { tool: 'read_base', icon: 'grid', running: 'AgenticAI.base', done: '7 entries' },
      { tool: 'generate_canvas', icon: 'canvas', running: 'placing 7 nodes', done: '7 nodes · 12 edges' },
    ],
    artifact: { type: 'canvas', labeled: false },
    outro: 'Done. The canvas centers on AgenticAI and links each related note.',
    tab: { name: 'AgenticAI.canvas', kind: 'canvas' },
  },
  {
    q: 'Describe the connections between these notes in the canvas and label the arrows.',
    intro: 'Analyzing each edge and writing a short label for it.',
    plan: ['Read the canvas edges', 'Describe each connection', 'Write the labels back'],
    tools: [
      { tool: 'read_canvas', icon: 'canvas', running: 'AgenticAI.canvas', done: '12 edges' },
      { tool: 'update_canvas', icon: 'canvas', running: 'labeling edges', done: '12 labels written' },
    ],
    artifact: { type: 'canvas', labeled: true },
    outro: 'Labeled all 12 connections, for example "depends on", "evaluates" and "feeds".',
    tab: { name: 'AgenticAI.canvas', kind: 'canvas' },
  },
  {
    q: 'Show me all meeting notes from January for meetings with John Doe.',
    intro: 'Filtering meeting notes by attendee and month.',
    plan: ['Filter notes where type is meeting', 'Match attendee John Doe', 'Restrict to January'],
    tools: [
      { tool: 'search_files', icon: 'search', running: 'type:meeting attendee:"John Doe"', done: '4 notes' },
      { tool: 'query_base', icon: 'grid', running: 'month = January', done: '4 results' },
    ],
    artifact: {
      type: 'base', title: 'Meetings · John Doe · January', view: 'Table',
      columns: ['Note', 'Attendees', 'Date'],
      rows: [
        ['Account sync', 'John Doe, Mia Khan', 'Jan 8'],
        ['Pricing review', 'John Doe, Tom Lee', 'Jan 14'],
        ['Roadmap call', 'John Doe', 'Jan 21'],
        ['Contract walk-through', 'John Doe, Sara P.', 'Jan 27'],
      ],
    },
    outro: 'Found 4 January meetings with John Doe.',
    tab: { name: 'Meetings.base', kind: 'base' },
  },
  {
    q: 'Create a summary of this meeting @process-analysis-sales-dpt as a new Meeting Note.',
    intro: 'Reading the meeting and writing a clean summary note.',
    plan: ['Read the meeting note', 'Summarize decisions and actions', 'Write a new Meeting Note'],
    tools: [
      { tool: 'read_file', icon: 'fileText', running: 'process-analysis-sales-dpt.md', done: '1,240 words' },
      { tool: 'write_file', icon: 'pen', running: 'Summary - Sales Process.md', done: 'note created' },
    ],
    artifact: {
      type: 'note',
      title: 'Summary — Sales Dept Process Analysis',
      props: [
        { k: 'type', v: 'meeting' },
        { k: 'date', v: '2026-06-19' },
        { k: 'attendees', v: 'Mia Khan, Tom Lee, Sara P.' },
        { k: 'tags', tags: ['meeting', 'sales', 'process'] },
      ],
      blocks: [
        { t: 'p', text: 'Process review of the sales department on June 19. The team walked the current lead-to-close funnel and agreed on three changes to reduce drop-off.' },
        { t: 'h2', text: 'Context' },
        { t: 'p', text: 'Most leads are lost between intake and the first call, mainly because qualification happens too late and the SDR-to-AE hand-off is manual.' },
        { t: 'h2', text: 'Decisions' },
        { t: 'li', text: 'Move lead qualification before the first sales call.' },
        { t: 'li', text: 'Adopt a shared CRM stage for "proposal sent".' },
        { t: 'li', text: 'Drop the spreadsheet hand-off between SDR and AE.' },
        { t: 'h2', text: 'Action items' },
        { t: 'li', text: 'Mia drafts the new intake form by Friday.' },
        { t: 'li', text: 'Tom migrates open deals into the new stages.' },
        { t: 'li', text: 'Sara sets up the weekly pipeline review.' },
        { t: 'h2', text: 'Open questions' },
        { t: 'li', text: 'Who owns a lead once it is marked unqualified?' },
      ],
    },
    outro: 'Wrote "Summary — Sales Dept Process Analysis" with the decisions and action items.',
    tab: { name: 'Summary - Sales Process.md', kind: 'note' },
  },
  {
    q: 'Create a draw.io diagram that visualizes the process from this meeting as a flowchart.',
    intro: 'Extracting the process steps and drawing a flowchart.',
    plan: ['Extract the process steps', 'Build the flowchart', 'Save as .drawio.svg'],
    tools: [
      { tool: 'read_file', icon: 'fileText', running: 'Summary - Sales Process.md', done: '6 steps' },
      { tool: 'create_drawio', icon: 'layout', running: 'building flowchart', done: '6 nodes · 6 edges' },
    ],
    artifact: { type: 'flow', kind: 'sales' },
    outro: 'Created sales-process.drawio.svg as a flowchart.',
    tab: { name: 'sales-process.drawio.svg', kind: 'flow' },
  },
  {
    q: 'Summarize this brainstorming in @product-launch-ideas and visualize the ideas in an Excalidraw graphic.',
    intro: 'Clustering the ideas and sketching them in Excalidraw.',
    plan: ['Read the brainstorming note', 'Cluster the ideas', 'Render an Excalidraw sketch'],
    tools: [
      { tool: 'read_file', icon: 'fileText', running: 'product-launch-ideas.md', done: '18 ideas' },
      { tool: 'create_excalidraw', icon: 'pen', running: 'sketching', done: '5 clusters' },
    ],
    artifact: { type: 'flow', kind: 'launch' },
    outro: 'Sketched 5 idea clusters in product-launch.excalidraw.',
    tab: { name: 'product-launch.excalidraw', kind: 'flow' },
  },
  {
    q: 'Change the tags in the metadata of all notes from "agenticai" to "Agentic-AI".',
    intro: 'Finding every note with that tag and rewriting the frontmatter.',
    plan: ['Find notes tagged agenticai', 'Rewrite the tag in frontmatter', 'Save each note'],
    tools: [
      { tool: 'search_files', icon: 'search', running: 'tag:agenticai', done: '7 notes' },
      { tool: 'edit_file', icon: 'pen', running: 'rewriting frontmatter', done: '7 notes updated' },
    ],
    artifact: {
      type: 'note',
      title: 'AgenticAI',
      tagChange: true,
      props: [
        { k: 'aliases', v: 'Agentic AI' },
        { k: 'created', v: '2026-05-02' },
        { k: 'tags', tags: ['agenticai'], newTags: ['Agentic-AI'] },
      ],
      blocks: [
        { t: 'p', text: 'Working notes on agentic systems: how a model plans, calls tools, and keeps state across a long-running task.' },
        { t: 'h2', text: 'Core ideas' },
        { t: 'li', text: 'Tool calling turns the model into an actor, not just a text generator.' },
        { t: 'li', text: 'Memory shaping keeps the context small but relevant.' },
        { t: 'li', text: 'Planning loops break a goal into verifiable steps.' },
        { t: 'h2', text: 'Related notes' },
        { t: 'p', text: 'See the AgenticAI Base and the canvas for how these topics connect.' },
      ],
    },
    outro: 'Updated the tag in 7 notes: agenticai becomes Agentic-AI.',
    tab: { name: 'AgenticAI.md', kind: 'note' },
  },
  {
    q: 'Search the internet for the latest Python release and create a summary note.',
    intro: 'Searching the web, then writing a summary note with the source.',
    plan: ['Search the web for the latest Python release', 'Extract version and highlights', 'Write a summary note'],
    tools: [
      { tool: 'web_search', icon: 'globe', running: 'latest Python release', done: 'python.org' },
      { tool: 'write_file', icon: 'pen', running: 'Python 3.14 Release.md', done: 'note created' },
    ],
    artifact: {
      type: 'note',
      title: 'Python 3.14 — Release Summary',
      props: [
        { k: 'source', v: 'python.org' },
        { k: 'date', v: '2026-06-21' },
        { k: 'tags', tags: ['python', 'release'] },
      ],
      blocks: [
        { t: 'p', text: 'Python 3.14 was released on June 21, 2026. The headline change is that the free-threaded build is now the default.' },
        { t: 'h2', text: 'Highlights' },
        { t: 'li', text: 'Free-threaded build ships as the default, no GIL toggle needed.' },
        { t: 'li', text: 'Faster interpreter startup and a lower memory footprint.' },
        { t: 'li', text: 'Template strings (t-strings) land in the language.' },
        { t: 'li', text: 'Several long-deprecated standard-library modules are removed.' },
        { t: 'h2', text: 'Why it matters' },
        { t: 'p', text: 'Free threading makes CPU-bound Python parallel without multiprocessing, which changes how data and agent tools get built.' },
        { t: 'h2', text: 'Source' },
        { t: 'p', text: 'https://www.python.org/downloads/' },
      ],
    },
    outro: 'Wrote "Python 3.14 — Release Summary" with the key changes and the source link.',
    tab: { name: 'Python 3.14 Release.md', kind: 'note' },
  },
]

/* ── canvas geometry (HTML cards + SVG edge lines, no distortion) ── */
const canvasNodes = [
  { x: 50, y: 42, label: 'AgenticAI', sub: 'topic' },
  { x: 17, y: 18, label: 'Tool calling', sub: 'note' },
  { x: 83, y: 18, label: 'Memory', sub: 'note' },
  { x: 13, y: 66, label: 'RAG', sub: 'note' },
  { x: 87, y: 66, label: 'Skills', sub: 'note' },
  { x: 33, y: 88, label: 'Planning', sub: 'note' },
  { x: 67, y: 88, label: 'Eval', sub: 'note' },
]
const canvasEdges = [
  { a: 0, b: 1, l: 'uses' }, { a: 0, b: 2, l: 'keeps' }, { a: 0, b: 3, l: 'retrieves' },
  { a: 0, b: 4, l: 'loads' }, { a: 0, b: 5, l: 'plans' }, { a: 0, b: 6, l: 'evaluates' },
  { a: 1, b: 5, l: 'feeds' }, { a: 2, b: 4, l: 'informs' }, { a: 3, b: 5, l: 'grounds' },
  { a: 4, b: 6, l: 'tested by' }, { a: 5, b: 6, l: 'measured by' }, { a: 1, b: 4, l: 'enables' },
]
function mid(e: { a: number; b: number }) {
  return { x: (canvasNodes[e.a].x + canvasNodes[e.b].x) / 2, y: (canvasNodes[e.a].y + canvasNodes[e.b].y) / 2 }
}

/* ── reactive state ── */
type Block =
  | { kind: 'user'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'plan'; steps: PlanStep[] }
  | { kind: 'tool'; tool: string; icon: string; status: 'running' | 'done'; detail: string }
const blocks = ref<Block[]>([])
const thinking = ref(false)
const inputPlain = ref('')
const typing = ref(false)
const chatScroll = ref<HTMLDivElement | null>(null)

const tab = ref<{ name: string; kind: string }>({ name: 'New tab', kind: 'empty' })
const view = ref<'empty' | 'base' | 'canvas' | 'note' | 'flow'>('empty')
const art = ref<any>(null)
const reveal = ref(0)           // generic reveal counter (rows / nodes / note blocks)
const edgesShown = ref(0)
const labelsShown = ref(false)
const tagSwapped = ref(false)

function renderInput(s: string): string {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.replace(/@([A-Za-z0-9_-]+)/g, '<span class="ed-mention">@$1</span>')
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
function scrollDown() {
  at(() => { if (chatScroll.value) chatScroll.value.scrollTop = chatScroll.value.scrollHeight }, 30)
}
function push(b: Block): Block { blocks.value.push(b); scrollDown(); return blocks.value[blocks.value.length - 1] }

async function typeInto(text: string, alive: () => boolean) {
  typing.value = true
  for (let i = 1; i <= text.length; i++) {
    if (!alive()) return
    inputPlain.value = text.slice(0, i)
    await wait(28)
  }
  typing.value = false
}

/* ── scene runner ── */
async function runScene(s: Scene, alive: () => boolean) {
  await typeInto(s.q, alive); if (!alive()) return
  await wait(500); if (!alive()) return
  push({ kind: 'user', text: s.q }); inputPlain.value = ''
  await wait(350); if (!alive()) return

  thinking.value = true; scrollDown()
  await wait(750); if (!alive()) return
  thinking.value = false

  push({ kind: 'text', text: s.intro })
  await wait(350); if (!alive()) return

  const plan = push({ kind: 'plan', steps: s.plan.map((t) => ({ text: t, done: false })) }) as { kind: 'plan'; steps: PlanStep[] }
  await wait(500); if (!alive()) return

  // run tools, ticking plan steps as we go
  for (let i = 0; i < s.tools.length; i++) {
    const td = s.tools[i]
    const tb = push({ kind: 'tool', tool: td.tool, icon: td.icon, status: 'running', detail: td.running }) as any
    if (plan.steps[i]) plan.steps[i].done = true
    await wait(1150); if (!alive()) return
    tb.status = 'done'; tb.detail = td.done
    scrollDown()
    // open the artifact right as the producing tool finishes
    if (i === s.tools.length - 1) openArtifact(s)
    await wait(400); if (!alive()) return
  }
  // any trailing plan steps
  plan.steps.forEach((st) => (st.done = true))

  await revealArtifact(s, alive); if (!alive()) return

  push({ kind: 'text', text: s.outro })
  await wait(2600)
}

function openArtifact(s: Scene) {
  tab.value = { name: s.tab.name, kind: s.tab.kind }
  art.value = s.artifact
  reveal.value = 0
  edgesShown.value = 0
  labelsShown.value = false
  tagSwapped.value = false
  view.value = s.artifact.type
}

async function revealArtifact(s: Scene, alive: () => boolean) {
  const a = s.artifact
  if (a.type === 'base') {
    for (let i = 0; i < a.rows.length; i++) { if (!alive()) return; reveal.value = i + 1; await wait(130) }
  } else if (a.type === 'note') {
    for (let i = 0; i < a.blocks.length; i++) { if (!alive()) return; reveal.value = i + 1; await wait(160) }
    if (a.tagChange) { await wait(500); if (!alive()) return; tagSwapped.value = true }
  } else if (a.type === 'canvas') {
    for (let i = 0; i < canvasNodes.length; i++) { if (!alive()) return; reveal.value = i + 1; await wait(170) }
    for (let i = 0; i < canvasEdges.length; i++) { if (!alive()) return; edgesShown.value = i + 1; await wait(70) }
    if (a.labeled) { await wait(300); if (!alive()) return; labelsShown.value = true }
  } else if (a.type === 'flow') {
    const total = a.kind === 'sales' ? 7 : 6
    for (let i = 0; i < total; i++) { if (!alive()) return; reveal.value = i + 1; await wait(220) }
  }
}

/* ── main loop ── */
async function runAll() {
  const myGen = ++gen
  const alive = () => gen === myGen
  while (alive()) {
    tab.value = { name: 'New tab', kind: 'empty' }
    view.value = 'empty'
    art.value = null
    for (const s of scenes) {
      if (!alive()) return
      await runScene(s, alive)
      if (!alive()) return
      blocks.value = []
      await wait(400)
    }
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
</script>

<template>
  <section class="ed-section">
    <div ref="rootEl" class="ed-stage">
      <div class="ed-window" role="img" aria-label="Vault Operator running inside Obsidian">
        <div class="ed-grid">
          <!-- header row -->
          <div class="ed-h-ribbon"><div class="ed-traffic"><span /><span /><span /></div></div>

          <div class="ed-h-editor">
            <span class="ed-h-ico" v-html="icon('panelLeft')" />
            <div class="ed-tab active">
              <span v-if="tab.kind !== 'empty'" class="ed-tab-ico" v-html="icon(tab.kind === 'base' ? 'grid' : tab.kind === 'canvas' ? 'canvas' : tab.kind === 'flow' ? 'layout' : 'fileText')" />
              <span class="ed-tab-name">{{ tab.name }}</span>
              <span class="ed-tab-x" v-html="icon('x')" />
            </div>
            <span class="ed-tab-add" v-html="icon('plus')" />
            <div class="ed-h-spacer" />
            <span class="ed-h-ico" v-html="icon('chevronDown')" />
          </div>

          <div class="ed-h-vo">
            <span v-for="t in voTabs" :key="t" class="ed-h-ico" v-html="icon(t)" />
            <span class="ed-h-ico active" v-html="icon('voSquare')" />
            <div class="ed-h-spacer" />
            <span class="ed-h-ico" v-html="icon('panelRight')" />
          </div>

          <!-- body row -->
          <nav class="ed-ribbon">
            <span v-for="(ic, i) in ribbonIcons" :key="i" class="ed-rib-ico" v-html="icon(ic)" />
          </nav>

          <main class="ed-editor">
            <div class="ed-subbar">
              <span class="ed-nav-ico" v-html="icon('arrowLeft')" />
              <span class="ed-nav-ico" v-html="icon('arrowRight')" />
              <span class="ed-subbar-title">{{ tab.name }}</span>
              <span class="ed-nav-ico" v-html="icon('more')" />
            </div>
            <div class="ed-content">
              <!-- empty -->
              <div v-show="view === 'empty'" class="ed-empty">
                <a class="ed-empty-link">Create new note <span class="ed-empty-kbd">(⌘ ⇧ N)</span></a>
                <a class="ed-empty-link">Go to file <span class="ed-empty-kbd">(⌘ O)</span></a>
                <a class="ed-empty-link">Close</a>
              </div>

              <!-- base -->
              <div v-if="view === 'base' && art" class="ed-base">
                <div class="ed-base-head">
                  <span class="ed-base-icon" v-html="icon('grid')" />
                  <span class="ed-base-title">{{ art.title }}</span>
                  <span class="ed-base-tabs"><span class="ed-base-view active">{{ art.view }}</span><span class="ed-base-view">Cards</span></span>
                  <div class="ed-h-spacer" />
                  <span class="ed-base-filter" v-html="icon('list')" />
                </div>
                <div class="ed-table">
                  <div class="ed-tr ed-th">
                    <span v-for="c in art.columns" :key="c">{{ c }}</span>
                  </div>
                  <div v-for="(r, i) in art.rows" :key="i" class="ed-tr" :class="{ shown: reveal > i }">
                    <span class="ed-td-name"><span class="ed-td-ico" v-html="icon('fileText')" />{{ r[0] }}</span>
                    <span class="ed-td-mid">
                      <template v-if="art.columns[1] === 'Tags'">
                        <span v-for="tg in String(r[1]).split(', ')" :key="tg" class="ed-chip">{{ tg }}</span>
                      </template>
                      <template v-else>{{ r[1] }}</template>
                    </span>
                    <span class="ed-td-mod">{{ r[2] }}</span>
                  </div>
                </div>
              </div>

              <!-- note -->
              <div v-if="view === 'note' && art" class="ed-note">
                <h1 class="ed-note-title" :class="{ shown: reveal > 0 }">{{ art.title }}</h1>
                <div class="ed-props" :class="{ shown: reveal > 0 }">
                  <div v-for="p in art.props" :key="p.k" class="ed-prop">
                    <span class="ed-prop-k">{{ p.k }}</span>
                    <span class="ed-prop-v">
                      <template v-if="p.tags">
                        <span v-for="tg in (tagSwapped && p.newTags ? p.newTags : p.tags)" :key="tg"
                          class="ed-prop-tag" :class="{ swapped: tagSwapped && p.newTags }">#{{ tg }}</span>
                      </template>
                      <template v-else>{{ p.v }}</template>
                    </span>
                  </div>
                </div>
                <div class="ed-note-body">
                  <template v-for="(b, i) in art.blocks" :key="i">
                    <h2 v-if="b.t === 'h2'" class="ed-nb ed-nb-h2" :class="{ shown: reveal > i + 1 }">{{ b.text }}</h2>
                    <div v-else-if="b.t === 'li'" class="ed-nb ed-nb-li" :class="{ shown: reveal > i + 1 }"><span class="ed-bullet" />{{ b.text }}</div>
                    <p v-else class="ed-nb ed-nb-p" :class="{ shown: reveal > i + 1 }">{{ b.text }}</p>
                  </template>
                </div>
              </div>

              <!-- canvas -->
              <div v-show="view === 'canvas'" class="ed-canvas">
                <svg class="ed-canvas-edges" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <line v-for="(e, i) in canvasEdges" :key="i"
                    :x1="canvasNodes[e.a].x" :y1="canvasNodes[e.a].y"
                    :x2="canvasNodes[e.b].x" :y2="canvasNodes[e.b].y"
                    :class="{ visible: edgesShown > i }" />
                </svg>
                <div v-for="(e, i) in canvasEdges" :key="'l' + i" class="ed-edge-label"
                  :class="{ shown: labelsShown }" :style="{ left: mid(e).x + '%', top: mid(e).y + '%' }">{{ e.l }}</div>
                <div v-for="(n, i) in canvasNodes" :key="'n' + i" class="ed-cnode"
                  :class="{ shown: reveal > i, root: i === 0 }" :style="{ left: n.x + '%', top: n.y + '%' }">
                  <span class="ed-cnode-ico" v-html="icon('fileText')" />
                  <span class="ed-cnode-label">{{ n.label }}</span>
                </div>
              </div>

              <!-- flow: drawio flowchart -->
              <div v-show="view === 'flow' && art && art.kind === 'sales'" class="ed-flow">
                <div class="ed-flow-col">
                  <div class="ed-fnode start" :class="{ shown: reveal > 0 }">Start</div>
                  <div class="ed-fconn" :class="{ shown: reveal > 1 }" />
                  <div class="ed-fnode" :class="{ shown: reveal > 1 }">Lead intake</div>
                  <div class="ed-fconn" :class="{ shown: reveal > 2 }" />
                  <div class="ed-fnode" :class="{ shown: reveal > 2 }">Qualify lead</div>
                  <div class="ed-fconn" :class="{ shown: reveal > 3 }" />
                  <div class="ed-fnode diamond" :class="{ shown: reveal > 3 }"><span>Qualified?</span></div>
                  <div class="ed-fbranch">
                    <div class="ed-fb" :class="{ shown: reveal > 4 }"><span class="ed-fb-tag">no</span><div class="ed-fnode muted">Archive lead</div></div>
                    <div class="ed-fb" :class="{ shown: reveal > 5 }"><span class="ed-fb-tag">yes</span><div class="ed-fnode">Send proposal</div></div>
                  </div>
                  <div class="ed-fconn short" :class="{ shown: reveal > 6 }" />
                  <div class="ed-fnode end" :class="{ shown: reveal > 6 }">Close deal</div>
                </div>
              </div>

              <!-- flow: excalidraw sketch -->
              <div v-show="view === 'flow' && art && art.kind === 'launch'" class="ed-sketch">
                <div class="ed-sk-center" :class="{ shown: reveal > 0 }">Launch</div>
                <div class="ed-sk-node n1" :class="{ shown: reveal > 1 }">Beta wait-list</div>
                <div class="ed-sk-node n2" :class="{ shown: reveal > 2 }">Press kit</div>
                <div class="ed-sk-node n3" :class="{ shown: reveal > 3 }">Pricing tiers</div>
                <div class="ed-sk-node n4" :class="{ shown: reveal > 4 }">Demo video</div>
                <div class="ed-sk-node n5" :class="{ shown: reveal > 5 }">Community AMA</div>
              </div>
            </div>
          </main>

          <aside class="ed-vo">
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
              <template v-for="(b, i) in blocks" :key="i">
                <div v-if="b.kind === 'user'" class="ed-msg user">{{ b.text }}</div>
                <div v-else-if="b.kind === 'text'" class="ed-msg assistant"><div class="ed-msg-text">{{ b.text }}</div></div>
                <div v-else-if="b.kind === 'plan'" class="ed-plan">
                  <div class="ed-plan-head"><span class="ed-plan-ico" v-html="icon('clipboard')" />Plan</div>
                  <div v-for="(st, si) in b.steps" :key="si" class="ed-plan-step" :class="{ done: st.done }">
                    <span class="ed-plan-box"><span v-if="st.done" class="ed-plan-tick" v-html="icon('checkSquare')" /></span>
                    <span class="ed-plan-text">{{ st.text }}</span>
                  </div>
                </div>
                <div v-else-if="b.kind === 'tool'" class="ed-tool" :class="b.status">
                  <span class="ed-tool-ico" v-html="icon(b.icon)" />
                  <span class="ed-tool-name">{{ b.tool }}</span>
                  <span class="ed-tool-detail">{{ b.detail }}</span>
                  <span v-if="b.status === 'running'" class="ed-spinner" />
                  <span v-else class="ed-tool-check" v-html="icon('checkCircle')" />
                </div>
              </template>
              <div v-if="thinking" class="ed-think"><span /><span /><span /></div>
            </div>

            <div class="ed-vo-compose">
              <div class="ed-input-box">
                <div class="ed-input-render">
                  <span v-if="!inputPlain && !typing" class="ed-input-ph">Type your message here...</span>
                  <span v-else v-html="renderInput(inputPlain)" /><span v-if="typing" class="ed-input-caret" />
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
.ed-section { width: 100%; max-width: 1280px; margin: 0 auto; padding: 1.75rem 1.5rem 1.5rem; }

.ed-stage {
  border-radius: 16px;
  padding: clamp(14px, 3vw, 34px);
  background: radial-gradient(120% 90% at 50% -20%, rgba(124, 58, 237, 0.20), transparent 55%), var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
}
.ed-window {
  --ed-blue: #5b81e0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 11px;
  overflow: hidden;
  background: var(--vp-c-bg);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22), 0 4px 14px rgba(0, 0, 0, 0.10);
}
.dark .ed-window { --ed-blue: #7aa0ff; box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55); }

.ed-grid {
  display: grid;
  grid-template-columns: 46px 2fr 1fr;
  grid-template-rows: 44px 1fr;
  grid-template-areas: "hr he hv" "rb ed vo";
  height: 640px;
}
:deep(.ed-window svg) { width: 100%; height: 100%; display: block; }

/* header */
.ed-h-ribbon { grid-area: hr; display: flex; align-items: center; padding-left: 4px; background: var(--vp-c-bg-soft); border-bottom: 1px solid var(--vp-c-divider); overflow: visible; }
.ed-traffic { display: flex; gap: 5px; }
.ed-traffic span { width: 10px; height: 10px; border-radius: 50%; }
.ed-traffic span:nth-child(1) { background: #ff5f57; }
.ed-traffic span:nth-child(2) { background: #febc2e; }
.ed-traffic span:nth-child(3) { background: #28c840; }

.ed-h-editor { grid-area: he; display: flex; align-items: stretch; gap: 0; background: var(--vp-c-bg-soft); border-right: 1px solid var(--vp-c-divider); border-bottom: 1px solid var(--vp-c-divider); padding-left: 0.5rem; }
.ed-h-ico { width: 17px; height: 17px; color: var(--vp-c-text-3); flex-shrink: 0; align-self: center; }
.ed-h-ico.active { color: var(--vp-c-text-1); }
.ed-h-spacer { flex: 1; }
.ed-tab { display: flex; align-items: center; gap: 0.4rem; margin-left: 0.5rem; padding: 0 0.5rem 0 0.7rem; font-size: 0.76rem; color: var(--vp-c-text-1); background: var(--vp-c-bg); border-radius: 6px 6px 0 0; max-width: 220px; white-space: nowrap; position: relative; align-self: flex-end; height: calc(100% - 6px); }
.ed-tab.active::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--vp-c-brand-1); border-radius: 2px; }
.ed-tab-ico { width: 13px; height: 13px; flex-shrink: 0; color: var(--vp-c-brand-1); }
.ed-tab-name { overflow: hidden; text-overflow: ellipsis; }
.ed-tab-x { width: 13px; height: 13px; opacity: 0.55; flex-shrink: 0; }
.ed-tab-add { width: 15px; height: 15px; align-self: center; margin: 0 0.6rem; color: var(--vp-c-text-3); }

.ed-h-vo { grid-area: hv; display: flex; align-items: center; gap: 0.7rem; padding: 0 0.7rem; background: var(--vp-c-bg-soft); border-bottom: 1px solid var(--vp-c-divider); }

/* ribbon */
.ed-ribbon { grid-area: rb; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 0.6rem 0; background: var(--vp-c-bg-soft); border-right: 1px solid var(--vp-c-divider); overflow: hidden; }
.ed-rib-ico { width: 18px; height: 18px; color: var(--vp-c-text-3); opacity: 0.78; flex-shrink: 0; }

/* editor */
.ed-editor { grid-area: ed; display: flex; flex-direction: column; min-width: 0; background: var(--vp-c-bg); border-right: 1px solid var(--vp-c-divider); }
.ed-subbar { display: flex; align-items: center; gap: 0.55rem; padding: 0 0.85rem; height: 40px; flex-shrink: 0; }
.ed-nav-ico { width: 15px; height: 15px; color: var(--vp-c-text-3); }
.ed-subbar-title { flex: 1; text-align: center; font-size: 0.78rem; color: var(--vp-c-text-2); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ed-content { flex: 1; min-height: 0; overflow: hidden; position: relative; background: var(--vp-c-bg); }

.ed-empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.5rem; }
.ed-empty-link { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--ed-blue); font-size: 0.95rem; cursor: pointer; }
.ed-empty-kbd { color: var(--ed-blue); opacity: 0.7; font-size: 0.9rem; }

/* base (Obsidian Bases) */
.ed-base { height: 100%; overflow-y: auto; padding: 0.9rem 1.1rem; }
.ed-base-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.85rem; }
.ed-base-icon { width: 17px; height: 17px; color: var(--vp-c-brand-1); }
.ed-base-title { font-size: 1.1rem; font-weight: 700; color: var(--vp-c-text-1); }
.ed-base-tabs { display: inline-flex; gap: 0.2rem; margin-left: 0.5rem; }
.ed-base-view { font-size: 0.7rem; color: var(--vp-c-text-3); padding: 2px 8px; border-radius: 5px; }
.ed-base-view.active { background: var(--vp-c-bg-soft); color: var(--vp-c-text-1); border: 1px solid var(--vp-c-divider); }
.ed-base-filter { width: 15px; height: 15px; color: var(--vp-c-text-3); }
.ed-table { border: 1px solid var(--vp-c-divider); border-radius: 8px; overflow: hidden; }
.ed-tr { display: grid; grid-template-columns: 1.3fr 1.7fr 0.7fr; align-items: center; border-bottom: 1px solid var(--vp-c-divider); font-size: 0.8rem; opacity: 0; transform: translateY(4px); transition: opacity 0.3s, transform 0.3s; }
.ed-tr > span { padding: 0.5rem 0.7rem; border-right: 1px solid var(--vp-c-divider); overflow: hidden; }
.ed-tr > span:last-child { border-right: none; }
.ed-tr.shown { opacity: 1; transform: translateY(0); }
.ed-tr:last-child { border-bottom: none; }
.ed-th { background: var(--vp-c-bg-soft); font-weight: 600; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vp-c-text-3); opacity: 1; transform: none; }
.ed-td-name { display: flex; align-items: center; gap: 0.4rem; color: var(--ed-blue); font-weight: 500; }
.ed-td-ico { width: 13px; height: 13px; color: var(--vp-c-text-3); flex-shrink: 0; }
.ed-td-mid { display: flex; flex-wrap: wrap; gap: 0.25rem; color: var(--vp-c-text-2); }
.ed-chip { font-size: 0.66rem; color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); padding: 1px 6px; border-radius: 4px; }
.ed-td-mod { color: var(--vp-c-text-3); font-size: 0.74rem; }

/* note (markdown + properties) */
.ed-note { height: 100%; overflow-y: auto; padding: 1.4rem 1.7rem; }
.ed-note-title { font-size: 1.5rem; font-weight: 700; color: var(--vp-c-text-1); margin: 0 0 0.7rem; opacity: 0; transition: opacity 0.3s; }
.ed-note-title.shown { opacity: 1; }
.ed-props { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.6rem 0.1rem 0.8rem; border-bottom: 1px solid var(--vp-c-divider); margin-bottom: 0.9rem; opacity: 0; transition: opacity 0.3s; }
.ed-props.shown { opacity: 1; }
.ed-prop { display: grid; grid-template-columns: 84px 1fr; align-items: center; font-size: 0.8rem; }
.ed-prop-k { color: var(--vp-c-text-3); }
.ed-prop-v { color: var(--vp-c-text-1); display: flex; flex-wrap: wrap; gap: 0.3rem; }
.ed-prop-tag { font-size: 0.72rem; color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); padding: 1px 7px; border-radius: 9px; transition: box-shadow 0.3s; }
.ed-prop-tag.swapped { box-shadow: 0 0 0 2px var(--vp-c-brand-1); }
.ed-note-body { display: flex; flex-direction: column; }
.ed-nb { opacity: 0; transform: translateY(4px); transition: opacity 0.3s, transform 0.3s; }
.ed-nb.shown { opacity: 1; transform: translateY(0); }
.ed-nb-h2 { font-size: 1.05rem; font-weight: 600; color: var(--vp-c-text-1); margin: 0.8rem 0 0.3rem; }
.ed-nb-p { font-size: 0.88rem; color: var(--vp-c-text-2); margin: 0.25rem 0; line-height: 1.55; }
.ed-nb-li { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.86rem; color: var(--vp-c-text-2); margin: 0.2rem 0; line-height: 1.5; }
.ed-bullet { width: 5px; height: 5px; border-radius: 50%; background: var(--vp-c-text-3); margin-top: 0.5em; flex-shrink: 0; }

/* canvas (HTML cards + svg edges) */
.ed-canvas {
  height: 100%; position: relative; overflow: hidden;
  background:
    radial-gradient(circle, var(--vp-c-divider) 1px, transparent 1.4px) 0 0 / 22px 22px,
    var(--vp-c-bg);
}
.ed-canvas-edges { position: absolute; inset: 0; }
.ed-canvas-edges line { stroke: var(--vp-c-text-3); stroke-width: 0.3; opacity: 0; transition: opacity 0.35s; }
.ed-canvas-edges line.visible { opacity: 0.45; }
.ed-cnode {
  position: absolute; transform: translate(-50%, -50%) scale(0.85);
  display: flex; align-items: center; gap: 0.35rem;
  background: var(--vp-c-bg-soft); border: 1px solid var(--vp-c-divider);
  border-radius: 7px; padding: 0.4rem 0.65rem; font-size: 0.78rem; font-weight: 500;
  color: var(--vp-c-text-1); white-space: nowrap; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  opacity: 0; transition: opacity 0.35s, transform 0.35s; z-index: 2;
}
.ed-cnode.shown { opacity: 1; transform: translate(-50%, -50%) scale(1); }
.ed-cnode.root { background: linear-gradient(var(--vp-c-brand-soft), var(--vp-c-brand-soft)), var(--vp-c-bg); border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); font-weight: 600; }
.ed-cnode-ico { width: 12px; height: 12px; color: var(--vp-c-text-3); }
.ed-cnode.root .ed-cnode-ico { color: var(--vp-c-brand-1); }
.ed-edge-label {
  position: absolute; transform: translate(-50%, -50%); z-index: 1;
  font-size: 0.6rem; color: var(--vp-c-text-2);
  background: var(--vp-c-bg); padding: 0 3px; border-radius: 3px;
  opacity: 0; transition: opacity 0.4s; white-space: nowrap;
}
.ed-edge-label.shown { opacity: 0.9; }

/* flow: drawio flowchart */
.ed-flow { height: 100%; overflow-y: auto; display: flex; justify-content: center; padding: 1.2rem 1rem; }
.ed-flow-col { display: flex; flex-direction: column; align-items: center; }
.ed-fnode {
  background: var(--vp-c-bg-soft); border: 1px solid var(--vp-c-divider); border-radius: 6px;
  padding: 0.4rem 1rem; font-size: 0.8rem; color: var(--vp-c-text-1); text-align: center; min-width: 120px;
  opacity: 0; transform: translateY(6px); transition: opacity 0.35s, transform 0.35s;
}
.ed-fnode.shown { opacity: 1; transform: translateY(0); }
.ed-fnode.start, .ed-fnode.end { border-radius: 16px; background: var(--vp-c-brand-soft); border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); font-weight: 600; }
.ed-fnode.muted { color: var(--vp-c-text-3); }
.ed-fnode.diamond { transform: rotate(45deg) scale(0.92); min-width: 0; width: 78px; height: 78px; display: flex; align-items: center; justify-content: center; padding: 0; border-radius: 8px; }
.ed-fnode.diamond.shown { transform: rotate(45deg) scale(1); }
.ed-fnode.diamond span { transform: rotate(-45deg); font-size: 0.74rem; }
.ed-fconn { width: 2px; height: 22px; background: var(--vp-c-text-3); opacity: 0; transition: opacity 0.3s; }
.ed-fconn.shown { opacity: 0.5; }
.ed-fconn.short { height: 16px; }
.ed-fbranch { display: flex; gap: 2.2rem; margin-top: 0.5rem; }
.ed-fb { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; opacity: 0; transition: opacity 0.35s; }
.ed-fb.shown { opacity: 1; }
.ed-fb-tag { font-size: 0.64rem; color: var(--vp-c-text-3); }

/* flow: excalidraw sketch */
.ed-sketch { height: 100%; position: relative; overflow: hidden; font-family: 'Comic Sans MS', 'Segoe Print', cursive; }
.ed-sk-center, .ed-sk-node {
  position: absolute; transform: translate(-50%, -50%);
  border: 2px solid var(--vp-c-text-2); padding: 0.4rem 0.8rem; font-size: 0.82rem; color: var(--vp-c-text-1);
  background: var(--vp-c-bg); opacity: 0; transition: opacity 0.4s;
}
.ed-sk-center.shown, .ed-sk-node.shown { opacity: 1; }
.ed-sk-center { left: 50%; top: 50%; border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); font-weight: 700; border-radius: 18px 14px 20px 12px; transform: translate(-50%, -50%) rotate(-2deg); }
.ed-sk-node { border-radius: 14px 10px 16px 9px; }
.ed-sk-node.n1 { left: 20%; top: 24%; transform: translate(-50%, -50%) rotate(-3deg); }
.ed-sk-node.n2 { left: 80%; top: 22%; transform: translate(-50%, -50%) rotate(2deg); }
.ed-sk-node.n3 { left: 16%; top: 70%; transform: translate(-50%, -50%) rotate(2deg); }
.ed-sk-node.n4 { left: 82%; top: 72%; transform: translate(-50%, -50%) rotate(-2deg); }
.ed-sk-node.n5 { left: 50%; top: 86%; transform: translate(-50%, -50%) rotate(1deg); }

/* Vault Operator */
.ed-vo { grid-area: vo; position: relative; display: flex; flex-direction: column; min-height: 0; background: var(--vp-c-bg); }
.ed-vo-sub { display: flex; align-items: center; height: 40px; padding: 0 0.6rem 0 0.85rem; flex-shrink: 0; }
.ed-vo-brand { font-family: var(--vp-font-family-mono); font-size: 0.9rem; font-weight: 700; color: var(--vp-c-text-1); }
.ed-vo-slash { color: var(--vp-c-text-3); margin-right: 0.4rem; font-weight: 400; }
.ed-vo-actions { display: flex; align-items: center; gap: 0.7rem; margin-left: auto; }
.ed-vo-ico { width: 16px; height: 16px; color: var(--vp-c-text-3); }

.ed-vo-chat { flex: 1; min-height: 0; overflow-y: auto; padding: 0.9rem 0.85rem 0.5rem; display: flex; flex-direction: column; gap: 0.6rem; }
.ed-msg { font-size: 0.8rem; line-height: 1.55; animation: msgIn 0.3s ease-out; max-width: 92%; }
@keyframes msgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.ed-msg.user { align-self: flex-end; background: var(--vp-c-brand-soft); color: var(--vp-c-text-1); padding: 0.5rem 0.7rem; border-radius: 11px 11px 3px 11px; }
.ed-msg.assistant { align-self: flex-start; }
.ed-msg.assistant .ed-msg-text { background: var(--vp-c-bg-soft); border: 1px solid var(--vp-c-divider); padding: 0.5rem 0.7rem; border-radius: 11px 11px 11px 3px; display: inline-block; color: var(--vp-c-text-1); }

.ed-plan { align-self: flex-start; width: 92%; background: var(--vp-c-bg-soft); border: 1px solid var(--vp-c-divider); border-radius: 10px; padding: 0.5rem 0.65rem; animation: msgIn 0.3s ease-out; }
.ed-plan-head { display: flex; align-items: center; gap: 0.35rem; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--vp-c-text-3); margin-bottom: 0.4rem; }
.ed-plan-ico { width: 13px; height: 13px; }
.ed-plan-step { display: flex; align-items: flex-start; gap: 0.45rem; font-size: 0.76rem; color: var(--vp-c-text-2); padding: 0.12rem 0; }
.ed-plan-box { width: 13px; height: 13px; border: 1.5px solid var(--vp-c-divider); border-radius: 3px; flex-shrink: 0; margin-top: 0.15rem; position: relative; }
.ed-plan-step.done .ed-plan-box { border-color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); }
.ed-plan-tick { position: absolute; inset: -1px; color: var(--vp-c-brand-1); }
.ed-plan-step.done .ed-plan-text { color: var(--vp-c-text-1); text-decoration: line-through; text-decoration-color: var(--vp-c-text-3); }

.ed-tool { align-self: stretch; display: grid; grid-template-columns: 15px auto 1fr auto; align-items: center; gap: 0.45rem; background: var(--vp-c-bg-soft); border: 1px solid var(--vp-c-divider); padding: 0.38rem 0.55rem; border-radius: 8px; font-family: var(--vp-font-family-mono); font-size: 0.7rem; animation: msgIn 0.25s ease-out; }
.ed-tool.done { border-color: var(--vp-c-brand-soft); }
.ed-tool-ico { width: 13px; height: 13px; color: var(--vp-c-brand-1); }
.ed-tool.running .ed-tool-ico { animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
.ed-tool-name { font-weight: 600; color: var(--vp-c-text-1); }
.ed-tool-detail { color: var(--vp-c-text-3); font-size: 0.66rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ed-spinner { width: 11px; height: 11px; border: 1.5px solid var(--vp-c-divider); border-top-color: var(--vp-c-brand-1); border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.ed-tool-check { width: 12px; height: 12px; color: #10b981; }

.ed-think { align-self: flex-start; display: flex; gap: 4px; padding: 0.55rem 0.7rem; background: var(--vp-c-bg-soft); border: 1px solid var(--vp-c-divider); border-radius: 11px 11px 11px 3px; }
.ed-think span { width: 5px; height: 5px; border-radius: 50%; background: var(--vp-c-text-3); animation: thinkDot 1.2s ease-in-out infinite; }
.ed-think span:nth-child(2) { animation-delay: 0.15s; }
.ed-think span:nth-child(3) { animation-delay: 0.3s; }
@keyframes thinkDot { 0%, 60%, 100% { opacity: 0.3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }

.ed-vo-compose { padding: 0.6rem 0.7rem 0.35rem; flex-shrink: 0; }
.ed-input-box { border: 1px solid var(--vp-c-divider); border-radius: 12px; background: var(--vp-c-bg); padding: 0.6rem 0.7rem 0.5rem; }
.ed-input-render { min-height: 34px; font-size: 0.82rem; line-height: 1.5; color: var(--vp-c-text-1); }
.ed-input-ph { color: var(--vp-c-text-3); }
.ed-input-caret { display: inline-block; width: 2px; height: 1em; background: var(--vp-c-brand-1); vertical-align: text-bottom; margin-left: 1px; animation: caretBlink 0.8s step-end infinite; }
@keyframes caretBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
.ed-input-bar { display: flex; align-items: center; gap: 0.55rem; margin-top: 0.5rem; }
.ed-model { display: inline-flex; align-items: center; gap: 0.2rem; font-size: 0.74rem; color: var(--vp-c-text-2); font-weight: 500; }
.ed-model-chev { width: 12px; height: 12px; color: var(--vp-c-text-3); }
.ed-bar-ico { width: 17px; height: 17px; color: var(--vp-c-text-3); }
.ed-send { width: 17px; height: 17px; color: var(--ed-blue); border: 1px solid var(--vp-c-divider); border-radius: 6px; padding: 4px; box-sizing: content-box; }
.ed-disclaimer { text-align: center; font-size: 0.66rem; color: var(--vp-c-text-3); margin: 0.5rem 0 0.3rem; padding: 0 22px; line-height: 1.4; }
.ed-status-dot { position: absolute; right: 0.6rem; bottom: 0.5rem; width: 16px; height: 16px; color: #10b981; }
:deep(.ed-mention) { color: var(--vp-c-brand-1); font-weight: 500; }

/* responsive */
@media (max-width: 880px) {
  .ed-grid { grid-template-columns: 46px 1.4fr 1fr; }
}
@media (max-width: 680px) {
  .ed-section { padding: 1rem 0.5rem 3rem; }
  .ed-stage { padding: 10px; border-radius: 12px; }
  .ed-grid { grid-template-columns: 1fr; grid-template-rows: 40px 1fr 40px 1.1fr; grid-template-areas: "he" "ed" "hv" "vo"; height: 720px; }
  .ed-ribbon, .ed-h-ribbon { display: none; }
  .ed-editor { border-right: none; border-bottom: 1px solid var(--vp-c-divider); }
  .ed-h-editor { border-right: none; }
}
</style>
