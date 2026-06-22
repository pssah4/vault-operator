<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

interface Testimonial {
  quote: string
  name: string
  source: string
}

const testimonials: Testimonial[] = [
  {
    quote: 'Vault Operator might be the best Obsidian agentic AI plugin out there.',
    name: 'Nick',
    source: 'Buy Me a Coffee',
  },
  {
    quote: "I've just discovered your wonderful plugin, which to me is way more than a simple plugin. It is a real harness inside Obsidian. That's awesome!",
    name: 'arkham000',
    source: 'GitHub',
  },
  {
    quote: "Vault Operator is one of the most interesting and powerful Obsidian plugins I've tried so far. The combination of agent functionality, vault access and document processing is particularly impressive.",
    name: 'Stapledon-de',
    source: 'GitHub',
  },
  {
    quote: 'Love your work with Vault Operator.',
    name: 'mikaljrue',
    source: 'Buy Me a Coffee',
  },
  {
    quote: "Vault Operator plugin is exactly what I was looking for. The ability to plug in MCP, the support for various models and providers, the skills, and workflows. I am really looking forward to get my hands dirty. I am hoping I won't need to use VS Code + GitHub Copilot to help me manage my vault anymore.",
    name: 'Anonymous supporter',
    source: 'Buy Me a Coffee',
  },
  {
    quote: 'I have only just started, but this is real motivation to get back into Obsidian again.',
    name: 'hkocam',
    source: 'Buy Me a Coffee, translated from German',
  },
]

const INTERVAL_MS = 3500
const currentIndex = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

function next() {
  currentIndex.value = (currentIndex.value + 1) % testimonials.length
}
function prev() {
  currentIndex.value = (currentIndex.value - 1 + testimonials.length) % testimonials.length
}
function goTo(i: number) {
  currentIndex.value = i
  restart()
}
function start() {
  if (timer) return
  timer = setInterval(next, INTERVAL_MS)
}
function stop() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
function restart() {
  stop()
  start()
}
function onPrev() {
  prev()
  restart()
}
function onNext() {
  next()
  restart()
}

onMounted(start)
onUnmounted(stop)
</script>

<template>
  <section
    class="vo-tn"
    aria-roledescription="carousel"
    aria-label="What people are saying about Vault Operator"
    @mouseenter="stop"
    @mouseleave="start"
    @focusin="stop"
    @focusout="start"
  >
    <div class="vo-tn-frame">
      <button class="vo-tn-nav vo-tn-prev" @click="onPrev" aria-label="Previous testimonial" type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div class="vo-tn-stage" aria-live="polite">
        <Transition name="vo-tn-fade" mode="out-in">
          <figure :key="currentIndex" class="vo-tn-slide">
            <blockquote class="vo-tn-quote"><span class="vo-tn-mark vo-tn-mark-open" aria-hidden="true">&ldquo;</span>{{ testimonials[currentIndex].quote }}<span class="vo-tn-mark vo-tn-mark-close" aria-hidden="true">&rdquo;</span></blockquote>
            <figcaption class="vo-tn-attr">
              <span class="vo-tn-name">{{ testimonials[currentIndex].name }}</span>
              <span class="vo-tn-sep" aria-hidden="true">&middot;</span>
              <span class="vo-tn-source">{{ testimonials[currentIndex].source }}</span>
            </figcaption>
          </figure>
        </Transition>
      </div>

      <button class="vo-tn-nav vo-tn-next" @click="onNext" aria-label="Next testimonial" type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>

    <div class="vo-tn-dots" role="tablist" aria-label="Choose testimonial">
      <button
        v-for="(t, i) in testimonials"
        :key="i"
        class="vo-tn-dot"
        :class="{ active: i === currentIndex }"
        @click="goTo(i)"
        :aria-label="`Show testimonial ${i + 1}`"
        :aria-selected="i === currentIndex"
        role="tab"
        type="button"
      />
    </div>
  </section>
</template>

<style scoped>
.vo-tn {
  max-width: 880px;
  margin: 2.25rem auto 2.5rem;
  padding: 0 1.5rem;
}

.vo-tn-frame {
  display: grid;
  grid-template-columns: 40px 1fr 40px;
  align-items: center;
  gap: 0.5rem;
}

.vo-tn-nav {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.vo-tn-nav:hover,
.vo-tn-nav:focus-visible {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-elv);
  outline: none;
}

.vo-tn-stage {
  position: relative;
  min-height: 140px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0.75rem 0.5rem;
}

.vo-tn-mark {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 2.4em;
  line-height: 0;
  vertical-align: -0.35em;
  color: var(--vp-c-brand-1);
  opacity: 0.55;
  user-select: none;
  pointer-events: none;
}
.vo-tn-mark-open {
  margin-right: 0.06em;
}
.vo-tn-mark-close {
  margin-left: 0.06em;
}

.vo-tn-slide {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
}

.vo-tn-quote {
  margin: 0;
  padding: 0;
  border: 0;
  font-size: clamp(1.05rem, 1.65vw, 1.25rem);
  line-height: 1.5;
  color: var(--vp-c-text-1);
  font-weight: 500;
  max-width: 680px;
  text-wrap: balance;
  font-style: normal;
}

.vo-tn-attr {
  font-size: 0.85rem;
  color: var(--vp-c-text-3);
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  justify-content: center;
}
.vo-tn-name {
  color: var(--vp-c-text-2);
  font-weight: 600;
}
.vo-tn-sep { opacity: 0.5; }

.vo-tn-fade-enter-active,
.vo-tn-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.vo-tn-fade-enter-from { opacity: 0; transform: translateY(4px); }
.vo-tn-fade-leave-to   { opacity: 0; transform: translateY(-4px); }

.vo-tn-dots {
  display: flex;
  justify-content: center;
  gap: 0.4rem;
  margin-top: 0.85rem;
}
.vo-tn-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 0;
  background: var(--vp-c-divider);
  cursor: pointer;
  padding: 0;
  transition: background 0.2s, width 0.2s, border-radius 0.2s;
}
.vo-tn-dot:hover { background: var(--vp-c-text-3); }
.vo-tn-dot.active {
  background: var(--vp-c-brand-1);
  width: 20px;
  border-radius: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .vo-tn-fade-enter-active,
  .vo-tn-fade-leave-active { transition: none; }
}

@media (max-width: 600px) {
  .vo-tn { margin: 1.5rem auto 1.75rem; padding: 0 1rem; }
  .vo-tn-frame { grid-template-columns: 32px 1fr 32px; gap: 0.25rem; }
  .vo-tn-nav { width: 32px; height: 32px; }
  .vo-tn-stage { min-height: 200px; padding: 0.5rem 0.25rem; }
  .vo-tn-mark { font-size: 2.1em; vertical-align: -0.3em; }
  .vo-tn-quote { font-size: 1rem; max-width: 100%; }
}
</style>
