<script setup lang="ts">
import { withBase } from 'vitepress'
</script>

<template>
  <section class="landing-hero">
    <a href="https://github.com/pssah4/vault-operator/releases" class="landing-badge" target="_blank" rel="noopener">
      <span class="landing-badge-version">v2.14.14</span>
      <span>Audit refactoring sweep -- the v2.14 line is stable.</span>
    </a>

    <h1 class="landing-title">Your Obsidian vault,<br>with a real AI agent.</h1>

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
  padding: 4.5rem 1.5rem 0;
  gap: 0;
  background: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(124, 58, 237, 0.25), transparent);
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
    padding: 3rem 1rem 0;
  }
  .landing-detail br { display: none; }
}
</style>
