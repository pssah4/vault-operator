# Two-Remote Setup: vault-operator + vault-operator

## Konzept

| Remote | Repo | Sichtbarkeit | Inhalt |
|--------|------|-------------|--------|
| `origin` | `github.com/pssah4/vault-operator` | Privat | Alle Branches, inkl. `dev` mit CLAUDE.md |
| `vault-operator` | `github.com/pssah4/vault-operator` | Öffentlich | Nur `main` — gespiegelt von `origin/main` ohne CLAUDE.md |

**Was NIE in vault-operator landet:**
- `CLAUDE.md` (intern, wird im GitHub Actions Workflow entfernt)
- `_devprocess/` (gitignored — existiert in keinem Remote)
- `.claude/`, `forked-kilocode/` (gitignored)
- `.env` (gitignored)

---

## Automatischer Sync: GitHub Actions

**Trigger:** Jeder Push auf `origin/main` (inkl. Merges via Pull Request)

**Workflow:** `.github/workflows/sync-public.yml`

Was der Workflow macht:
1. Checkout `origin/main`
2. `git rm --cached CLAUDE.md` (staged deletion)
3. Commit (nur wenn CLAUDE.md vorhanden)
4. Force-push zu `vault-operator/main`

---

## Einmaliges Setup

### Schritt 1: Personal Access Token (PAT) erstellen

1. GitHub öffnen → **Settings** (oben rechts, Profilbild)
2. Links: **Developer settings** → **Personal access tokens** → **Tokens (classic)**
3. **Generate new token (classic)**
4. Token-Einstellungen:
   - **Note:** `vault-operator sync`
   - **Expiration:** 1 year (oder "No expiration")
   - **Scopes:** `repo` (alles unter repo ankreuzen)
5. **Generate token** → Token kopieren (nur einmal sichtbar!)

### Schritt 2: PAT als Secret im privaten Repo speichern

1. Gehe zu: `github.com/pssah4/vault-operator` → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret**
3. Einstellungen:
   - **Name:** `OBSILO_PUBLIC_TOKEN`
   - **Secret:** (den kopierten PAT einfügen)
4. **Add secret**

### Schritt 3: Workflow aktivieren (automatisch)

Der Workflow in `.github/workflows/sync-public.yml` ist bereits im Repo. Er wird bei jedem Push auf `main` automatisch ausgeführt.

**Prüfen ob alles funktioniert:**
1. Merge irgendetwas auf `origin/main` (oder push direkt)
2. Gehe zu `github.com/pssah4/vault-operator` → **Actions** Tab
3. Der Workflow "Sync to vault-operator" sollte grün sein
4. Prüfe `github.com/pssah4/vault-operator` → kein `CLAUDE.md` vorhanden

---

## Workflow für tägliche Arbeit

```
Feature entwickeln (dev branch)
         │
         ▼
    git push origin dev          → nur vault-operator (privat)
         │
         ▼
  Pull Request: dev → main        → in vault-operator
         │
         ▼
    Merge PR                      → GitHub Actions startet automatisch
         │
         ▼
  vault-operator/main aktuell             → vault-operator/main aktuell (ohne CLAUDE.md)
```

### Lokale Remote-Konfiguration

```bash
git remote -v
# origin       https://github.com/pssah4/vault-operator.git (fetch/push)
# vault-operator https://github.com/pssah4/vault-operator.git (fetch/push)
```

Das `vault-operator` Remote wird nur noch für den manuellen Fallback benötigt (Publish-Script). Der automatische Sync läuft über GitHub Actions.

---

## Fallback: Manueller Publish

Falls GitHub Actions nicht verfügbar oder ein Hotfix nötig ist:

```bash
bash _devprocess/scripts/publish.sh
```

Der Publish-Script pusht den aktuellen Branch direkt zu `vault-operator/main` (force push). Private Dateien sind gitignored und erscheinen nicht. **CLAUDE.md** wird jedoch mitgepusht — daher ist der Actions-Workflow der bevorzugte Weg.

---

## GitHub Pages

GitHub Pages ist auf `vault-operator` aktiviert:
- **Branch:** `main`
- **Folder:** `/docs`
- **URL:** `https://pssah4.github.io/vault-operator`

---

## Troubleshooting

**Actions-Workflow schlägt fehl mit "Permission denied":**
- PAT ist abgelaufen → neuen PAT erstellen, Secret aktualisieren
- PAT hat nicht `repo` Scope → neuen PAT mit korrekten Scopes erstellen

**CLAUDE.md erscheint doch in vault-operator:**
- Prüfen ob Workflow läuft (Actions Tab)
- Sicherstellen dass CLAUDE.md in `origin/main` getrackt ist (`git ls-files CLAUDE.md`)

**vault-operator hat anderen Inhalt als vault-operator/main:**
- Normal: vault-operator hat einen extra Commit "remove internal-only files"
- Commit-History unterscheidet sich leicht (akzeptabel)
