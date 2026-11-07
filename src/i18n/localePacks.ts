/**
 * Language-pack coordination (FEAT-42-05).
 *
 * English is bundled into main.js. The eight other locales ship as
 * on-demand JSON packs (release assets, hash-pinned in
 * src/_generated/locale-hashes.ts). This module ties the i18n layer to the
 * OptionalAssetManager: it builds the spec for the active locale, loads and
 * applies an installed pack at boot, and reports whether a download is
 * pending so the host can offer it once.
 */

import type { Plugin } from 'obsidian';
import { OptionalAssetManager, buildLocaleSpec, type AssetSpec } from '../core/assets/OptionalAssetManager';
import { LOCALE_PACK_SHA256 } from '../_generated/locale-hashes';
import { applyLocalePack, getActiveLocale, needsLocalePack, type SupportedLocale } from './index';
import type { Translations } from './types';

/** Human-readable names for the Settings UI and boot prompt. */
export const LOCALE_LABELS: Record<Exclude<SupportedLocale, 'en'>, string> = {
    de: 'Deutsch',
    zh: '简体中文 (Simplified Chinese)',
    'zh-TW': '繁體中文 (Traditional Chinese)',
    ja: '日本語 (Japanese)',
    ko: '한국어 (Korean)',
    es: 'Español (Spanish)',
    fr: 'Français (French)',
    ru: 'Русский (Russian)',
    it: 'Italiano (Italian)',
};

/** The pack-code used in filenames/hashes (lowercase locale). */
function packCode(locale: SupportedLocale): string {
    return locale.toLowerCase();
}

/**
 * Build the AssetSpec for the active locale, or null when the app runs in
 * English (no pack) or no hash is pinned for it (should not happen for a
 * supported locale in a release build).
 */
export function activeLocaleSpec(plugin: Plugin): AssetSpec | null {
    if (!needsLocalePack()) return null;
    const locale = getActiveLocale();
    const code = packCode(locale);
    const sha = LOCALE_PACK_SHA256[code];
    if (!sha) return null;
    const label = LOCALE_LABELS[locale as Exclude<SupportedLocale, 'en'>] ?? locale;
    return buildLocaleSpec(plugin.manifest.version, code, label, sha);
}

export interface LocalePackBootResult {
    /** True when the active locale needs a pack. */
    needed: boolean;
    /** True when a pack was found, verified, and applied. */
    applied: boolean;
    /** The active locale spec, present whenever `needed` is true. */
    spec: AssetSpec | null;
}

/**
 * At boot: if the app runs in a non-English locale and the matching pack is
 * installed and hash-valid, apply it so the UI renders translated. Missing or
 * invalid packs leave English active and report `applied: false` so the host
 * can offer a one-time download. Never downloads on its own (Obsidian policy:
 * network only on explicit user action).
 */
export async function loadInstalledLocalePack(plugin: Plugin): Promise<LocalePackBootResult> {
    const spec = activeLocaleSpec(plugin);
    if (!spec) return { needed: needsLocalePack(), applied: false, spec: null };
    const manager = new OptionalAssetManager(plugin);
    const table = await manager.loadJson<Translations>(spec);
    if (!table) return { needed: true, applied: false, spec };
    applyLocalePack(table);
    return { needed: true, applied: true, spec };
}
