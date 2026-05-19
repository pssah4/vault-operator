<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { withBase } from 'vitepress'

const typewriterText = ref<HTMLSpanElement>()
const mentionDropdown = ref<HTMLDivElement>()
const mentionItem = ref<HTMLDivElement>()

interface MentionSegment { type: 'mention'; typed: string; full: string; file: string }
interface TextSegment { type: 'text'; value: string }
interface SlashSegment { type: 'slash'; typed: string; full: string; label: string }
type Segment = TextSegment | MentionSegment | SlashSegment
interface ComplexPrompt { segments: Segment[] }
type Prompt = string | ComplexPrompt

const prompts: Prompt[] = [
  {
    segments: [
      { type: 'text', value: 'Find all Notes related to ' },
      { type: 'mention', typed: 'Agenti', full: 'AgenticAI', file: 'AgenticAI.md' },
      { type: 'text', value: ' and create a Base.' },
    ],
  },
  'Create a Canvas based on this Base that shows the relationships between the Notes.',
  'Describe the connections between these Notes in the created Canvas and label the arrows.',
  'Show me all meeting notes from January for meetings with John Doe.',
  {
    segments: [
      { type: 'text', value: 'Create a summary of this meeting ' },
      { type: 'mention', typed: 'proce', full: 'process-analysis-sales-dpt', file: 'process-analysis-sales-dpt.md' },
      { type: 'text', value: ' as a new Meeting Note.' },
    ],
  },
  'Create a draw.io diagram that visualizes the process from this meeting as a flowchart.',
  {
    segments: [
      { type: 'text', value: 'Summarize this brainstorming in ' },
      { type: 'mention', typed: 'produ', full: 'product-launch-ideas', file: 'product-launch-ideas.md' },
      { type: 'text', value: ' and visualize the ideas in an Excalidraw graphic.' },
    ],
  },
  'Change the tags in the metadata of all Notes from "agenticai" to "Agentic-AI".',
  'Search the internet for the latest Python release and create a summary note.',
]


function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function isSimple(p: Prompt): p is string { return typeof p === 'string' }
function getPlainText(p: Prompt): string {
  if (isSimple(p)) return p
  let t = ''
  for (const s of (p as ComplexPrompt).segments) {
    if (s.type === 'text') t += s.value
    else if (s.type === 'mention') t += '@' + s.full
    else if (s.type === 'slash') t += '/' + s.full
  }
  return t
}

onMounted(() => {
  const el = typewriterText.value
  const dropdown = mentionDropdown.value
  const dropdownItemEl = mentionItem.value
  if (!el || !dropdown || !dropdownItemEl) return

  let promptIdx = 0
  const activePrompts = prompts

  function animateSimple(text: string, onDone: () => void) {
    let ci = 0
    function typeChar() {
      ci++
      el!.textContent = text.slice(0, ci)
      if (ci >= text.length) { setTimeout(() => deleteFrom(text, text.length, onDone), 2000); return }
      setTimeout(typeChar, 50)
    }
    typeChar()
  }

  function deleteFrom(plain: string, ci: number, onDone: () => void) {
    function del() {
      ci--
      el!.textContent = plain.slice(0, ci)
      if (ci <= 0) { setTimeout(onDone, 400); return }
      setTimeout(del, 25)
    }
    del()
  }

  function animateComplex(prompt: ComplexPrompt, onDone: () => void) {
    const segments = prompt.segments
    const completed: { html: string; plain: string }[] = []
    let segIdx = 0

    function renderCompleted(partial?: string) {
      let html = ''
      for (const c of completed) html += c.html
      if (partial) html += escHtml(partial)
      el!.innerHTML = html
    }

    function nextSegment() {
      if (segIdx >= segments.length) {
        const plain = getPlainText(prompt)
        setTimeout(() => deleteFrom(plain, plain.length, onDone), 2000)
        return
      }
      const seg = segments[segIdx]; segIdx++
      if (seg.type === 'text') typeTextSeg(seg.value, nextSegment)
      else if (seg.type === 'mention') typeMentionSeg(seg as MentionSegment, nextSegment)
      else if (seg.type === 'slash') typeSlashSeg(seg as SlashSegment, nextSegment)
    }

    function typeTextSeg(value: string, cb: () => void) {
      let ci = 0
      function t() {
        ci++; renderCompleted(value.slice(0, ci))
        if (ci >= value.length) { completed.push({ html: escHtml(value), plain: value }); cb(); return }
        setTimeout(t, 50)
      }
      t()
    }

    function typeMentionSeg(seg: MentionSegment, cb: () => void) {
      const typed = '@' + seg.typed; let ci = 0; let shown = false
      function t() {
        ci++; renderCompleted(typed.slice(0, ci))
        if (ci >= 4 && !shown) { shown = true; dropdownItemEl!.textContent = seg.file; dropdown!.classList.add('visible') }
        if (ci >= typed.length) {
          setTimeout(() => {
            dropdown!.classList.remove('visible')
            completed.push({ html: '<span class="mention-pill">@' + escHtml(seg.full) + '</span>', plain: '@' + seg.full })
            renderCompleted(''); setTimeout(cb, 100)
          }, 600)
          return
        }
        setTimeout(t, 50)
      }
      t()
    }

    function typeSlashSeg(seg: SlashSegment, cb: () => void) {
      const typed = '/' + seg.typed; const full = '/' + seg.full; let ci = 0; let shown = false
      function t() {
        ci++; renderCompleted(typed.slice(0, ci))
        if (ci >= 3 && !shown) { shown = true; dropdownItemEl!.textContent = seg.label; dropdown!.classList.add('visible') }
        if (ci >= typed.length) {
          setTimeout(() => {
            dropdown!.classList.remove('visible')
            completed.push({ html: '<span class="slash-pill">' + escHtml(full) + '</span>', plain: full })
            renderCompleted(''); setTimeout(cb, 100)
          }, 600)
          return
        }
        setTimeout(t, 50)
      }
      t()
    }

    nextSegment()
  }

  function next() {
    const p = activePrompts[promptIdx]
    promptIdx = (promptIdx + 1) % activePrompts.length
    if (isSimple(p)) animateSimple(p, next)
    else animateComplex(p as ComplexPrompt, next)
  }
  next()
})
</script>

<template>
  <section class="landing-hero">
    <a href="https://github.com/pssah4/vault-operator/releases" class="landing-badge" target="_blank" rel="noopener">
      <span class="landing-badge-version">v2.11.7</span>
      <span>Internal caches moved out of vault. iCloud Sync no longer stalls Obsidian Mobile when the vault contains the plugin.</span>
    </a>

    <h1 class="landing-title">Your Obsidian vault,<br>with a real AI Agent.</h1>

    <div class="landing-chat">
      <div class="landing-chat-header">
        <div class="landing-dots"><span /><span /><span /></div>
        Vault Operator
      </div>
      <div class="landing-chat-body">
        <span class="landing-prompt">&gt;</span>
        <span ref="typewriterText" class="landing-text" /><span class="landing-cursor" />
        <div ref="mentionDropdown" class="landing-dropdown">
          <div ref="mentionItem" class="landing-dropdown-item" />
        </div>
      </div>
    </div>

    <p class="landing-sub">Learns your vault and your workflows.</p>
    <p class="landing-detail">
      60+ tools. Block-level provenance from sense-making notes back to source paragraphs.<br>
      Hybrid semantic search, persistent memory, cross-surface MCP, multi-agent workflows.<br>
      Local-first. Open source. Free to use.
    </p>

    <div class="landing-cta">
      <a :href="withBase('/tutorials/getting-started')" class="landing-btn-primary">Get Started</a>
      <a :href="withBase('/guides/capabilities')" class="landing-btn-secondary">
What Vault Operator Can Do
      </a>
    </div>
  </section>
</template>

<style scoped>
/* ── Hero Section ── */
.landing-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 5rem 1.5rem 3rem;
  gap: 0;
  background: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(124, 58, 237, 0.25), transparent);
  min-height: calc(100vh - 64px);
}

/* ── Badge ── */
.landing-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  padding: 0.25rem 0.85rem;
  font-size: 0.75rem;
  color: var(--vp-c-text-2);
  margin-bottom: 1.25rem;
  text-decoration: none;
  transition: border-color 0.15s, background 0.15s;
}
.landing-badge:hover {
  background: var(--vp-c-bg-elv);
  border-color: var(--vp-c-brand-1);
  text-decoration: none;
}
.landing-badge-version {
  color: var(--vp-c-brand-1);
  font-weight: 600;
}

/* ── Title ── */
.landing-title {
  font-size: clamp(2.2rem, 5vw, 3.5rem);
  font-weight: 800;
  margin-bottom: 0.75rem;
  background: linear-gradient(135deg, var(--vp-c-text-1) 30%, var(--vp-c-brand-1));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1.15;
  text-wrap: balance;
}

/* ── Chat Mockup ── */
.landing-chat {
  max-width: 560px;
  width: 100%;
  margin: 1.25rem auto 1.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 0 40px rgba(124, 58, 237, 0.08);
}
.landing-chat-header {
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
  padding: 0.45rem 0.85rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.landing-dots {
  display: flex;
  gap: 5px;
}
.landing-dots span {
  width: 7px; height: 7px;
  border-radius: 50%;
  opacity: 0.7;
}
.landing-dots span:nth-child(1) { background: #ef4444; }
.landing-dots span:nth-child(2) { background: #f59e0b; }
.landing-dots span:nth-child(3) { background: #10b981; }
.landing-chat-body {
  background: var(--vp-c-bg-alt);
  padding: 0.7rem 1rem;
  min-height: 46px;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  position: relative;
}
.landing-prompt {
  color: var(--vp-c-brand-1);
  font-family: var(--vp-font-family-mono);
  font-size: 0.82rem;
  font-weight: 600;
  flex-shrink: 0;
  user-select: none;
  line-height: 1.6;
}
.landing-text {
  font-family: var(--vp-font-family-mono);
  font-size: 0.82rem;
  color: var(--vp-c-text-1);
  line-height: 1.6;
  min-height: 1.6em;
}
.landing-cursor {
  display: inline-block;
  width: 2px;
  height: 1.15em;
  background: var(--vp-c-brand-1);
  vertical-align: text-bottom;
  margin-left: 1px;
  animation: cursorBlink 0.8s step-end infinite;
}
@keyframes cursorBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* ── Mention Dropdown ── */
.landing-dropdown {
  position: absolute;
  top: 100%;
  left: 2rem;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 0.2rem;
  min-width: 180px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  display: none;
  z-index: 10;
}
.landing-dropdown.visible { display: block; }
.landing-dropdown-item {
  padding: 0.3rem 0.6rem;
  font-size: 0.78rem;
  color: var(--vp-c-text-1);
  background: var(--vp-c-brand-soft);
  border-radius: 4px;
  font-family: var(--vp-font-family-mono);
  white-space: nowrap;
}

/* Pills injected via innerHTML */
:deep(.mention-pill) {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  font-size: inherit;
  font-family: inherit;
}
:deep(.slash-pill) {
  color: var(--vp-c-brand-1);
  font-size: inherit;
  font-family: inherit;
  font-weight: 600;
}

/* ── Sub text ── */
.landing-sub {
  font-size: clamp(1.15rem, 2.5vw, 1.35rem);
  color: var(--vp-c-text-1);
  max-width: 720px;
  margin-bottom: 0.4rem;
  line-height: 1.7;
  text-wrap: pretty;
  font-weight: 600;
}
.landing-detail {
  font-size: clamp(0.95rem, 2vw, 1.1rem);
  color: var(--vp-c-text-2);
  max-width: 720px;
  margin-bottom: 0.4rem;
  line-height: 1.7;
  text-wrap: pretty;
}

/* ── CTA ── */
.landing-cta {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 1rem;
}
.landing-btn-primary {
  background: #7c3aed;
  color: #fff;
  padding: 0.6rem 1.5rem;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.9rem;
  transition: background 0.15s, transform 0.1s;
  text-decoration: none;
  display: inline-block;
}
.landing-btn-primary:hover {
  background: #6d28d9;
  transform: translateY(-1px);
  text-decoration: none;
}
.landing-btn-secondary {
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
  padding: 0.6rem 1.5rem;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.9rem;
  transition: border-color 0.15s, transform 0.1s;
  text-decoration: none;
  display: inline-block;
}
.landing-btn-secondary:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-1px);
  text-decoration: none;
}

/* ── Responsive ── */
@media (max-width: 600px) {
  .landing-hero {
    padding: 3rem 1rem 2rem;
  }
  .landing-detail br { display: none; }
  .landing-chat { margin: 1rem auto 0; }
  .landing-chat-body { padding: 0.7rem 0.75rem; }
  .landing-text { font-size: 0.78rem; }
  .landing-dropdown { left: 1rem; min-width: 150px; }
}
</style>
