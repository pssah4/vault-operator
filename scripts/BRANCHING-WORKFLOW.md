# Branching & Release Workflow

## Repos im Überblick

| Repo | Sichtbarkeit | Zweck |
|------|-------------|-------|
| `github.com/pssah4/vault-operator` | Privat | Entwicklung — alle Branches |
| `github.com/pssah4/vault-operator` | Öffentlich | Releases — nur `main` |

---

## Branch-Struktur (vault-operator, privat)

```
dev     →  test     →  main     →  vault-operator/main
(Entwicklung)  (Staging)  (Release)   (öffentlich, ohne CLAUDE.md)
```

### `dev`
- Aktiver Entwicklungs-Branch
- Enthält `CLAUDE.md` (Projekt-Manifest für Claude Code)
- `_devprocess/` ist gitignored — interne Docs existieren nur lokal
- Wird **nicht** automatisch syncronisiert

### `test`
- Staging-Branch — stabiler Stand von `dev`
- Enthält ebenfalls `CLAUDE.md` (wird für die Entwicklung benötigt)
- Merge: `dev → test` (manuell via PR in vault-operator)
- Wird **nicht** automatisch synchronisiert

### `main` (vault-operator, privat)
- Release-Branch — getesteter Stand aus `test`
- Merge: `test → main` (manuell via PR in vault-operator)
- **Trigger:** Push auf `main` startet automatisch den GitHub Actions Workflow

### `main` (vault-operator, öffentlich)
- Gespiegelt von `vault-operator/main`, gefiltert:
  - `CLAUDE.md` wird entfernt
- Wird **automatisch** via GitHub Actions aktualisiert (kein manueller Schritt)

---

## Kompletter Ablauf

```
1. Feature entwickeln
   git checkout dev
   git commit ...
   git push origin dev

2. Für Staging bereit
   → PR auf GitHub: dev → test (in vault-operator)
   → Merge

3. Für Release bereit
   → PR auf GitHub: test → main (in vault-operator)
   → Merge
         │
         ▼ (automatisch)
   GitHub Actions: sync-public.yml
         │
         ├── Checkout vault-operator/main
         ├── CLAUDE.md entfernen
         ├── Commit (gefiltert)
         └── Force-Push → vault-operator/main
```

---

## Was ist wo vorhanden

| Datei / Ordner | dev | test | main (vault-operator) | main (vault-operator) |
|----------------|-----|------|---------------|----------------------|
| `src/` | ✓ | ✓ | ✓ | ✓ |
| `docs/` | ✓ | ✓ | ✓ | ✓ |
| `CLAUDE.md` | ✓ | ✓ | ✓ | ✗ (entfernt) |
| `_devprocess/` | gitignored | gitignored | gitignored | gitignored |
| `.claude/` | gitignored | gitignored | gitignored | gitignored |
| `forked-kilocode/` | gitignored | gitignored | gitignored | gitignored |
| `.env` | gitignored | gitignored | gitignored | gitignored |

---

## GitHub Actions Workflow

Datei: `.github/workflows/sync-public.yml`
Trigger: Push auf `vault-operator/main`

Einmaliges Setup:
1. PAT erstellen (github.com → Settings → Developer settings → Tokens (classic), Scope: `repo`)
2. Secret `OBSILO_PUBLIC_TOKEN` in vault-operator Repo Settings → Secrets and variables → Actions hinterlegen

Details: `_devprocess/docs/TWO-REMOTE-SETUP.md`

---

## Lokale Remotes

```bash
git remote -v
# origin         https://github.com/pssah4/vault-operator.git (fetch/push)
# vault-operator  https://github.com/pssah4/vault-operator.git (fetch/push)
```

Das `vault-operator` Remote wird lokal nur noch als Fallback für den manuellen
Publish-Script benötigt. Der reguläre Sync läuft über GitHub Actions.
