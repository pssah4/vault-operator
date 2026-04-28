---
id: FEATURE-021-003
name: ChatGPT OAuth Settings UI
phase: Building
status: Planned
epic: EPIC-021
depends-on: [FEATURE-021-001, FEATURE-021-002]
---

# Feature: Settings-UI mit "Mit ChatGPT anmelden"

> **Feature ID**: FEATURE-021-003
> **Epic**: EPIC-021 ChatGPT OAuth Provider
> **Prioritaet**: P0-Critical
> **Aufwand**: S
> **Status**: Geplant

## Feature Description

Erweiterung des `ModelConfigModal` um einen Provider-Block fuer `chatgpt-oauth`. Der Block enthaelt einen "Mit ChatGPT anmelden"-Button, zeigt nach erfolgreichem Login Account-Email und Plan-Tier (Plus, Pro), bietet ein Modell-Dropdown und einen "Verbindung trennen"-Button. Disclaimer-Text erklaert, dass die Verbindung undokumentierte Endpoints nutzt und sich aendern kann.

## Benefits Hypothesis

**Wir glauben, dass** ein klarer Login-Block mit Status-Anzeige und Disclaimer
**folgende messbare Outcomes liefert:**

- Nutzer verstehen sofort, woran sie sind und wie sie verbunden bzw. getrennt sind.
- Nutzer treffen die Risiko-Entscheidung bewusst (Subscription-Endpoint vs. BYOK).

**Wir wissen, dass wir erfolgreich sind, wenn:**

- Mehr als 90 Prozent der Nutzer im UAT finden den Login-Button beim ersten Versuch.
- Mehr als 95 Prozent der Disclaimer-Leser koennen das Hauptrisiko im Nachgespraech in eigenen Worten benennen.

## Jobs to be Done

| Job-Typ | Job | User Story |
|---------|-----|-----------|
| Funktional | Provider auswaehlen, einloggen und sofort nutzen | Story 1 |
| Funktional | Status der Verbindung jederzeit pruefen | Story 2 |
| Emotional | Sicherheit haben, das Risiko zu kennen | Story 3 |
| Sozial | Dem Plugin-Reviewer und sich selbst zeigen, dass die Loesung sauber dokumentiert ist | Story 4 |

## User Stories

### Story 1: Provider auswaehlen und einloggen (Funktional)

**Als** Nutzer im Settings-Modal
**moechte ich** "ChatGPT (OAuth)" als Provider waehlen koennen, dann auf "Mit ChatGPT anmelden" klicken,
**damit ich** in unter einer Minute verbunden bin.

### Story 2: Verbindungsstatus sehen (Funktional)

**Als** verbundener Nutzer
**moechte ich** im Settings-Modal sehen, mit welchem Account ich verbunden bin und wann das Token zuletzt erneuert wurde,
**damit ich** weiss, dass alles laeuft.

### Story 3: Disclaimer-Hinweis (Emotional)

**Als** sicherheitsbewusster Nutzer
**moechte ich** vor dem Login einen kurzen Hinweis lesen, dass dieser Provider undokumentierte ChatGPT-Endpoints nutzt und sich aendern kann,
**damit ich** das Risiko bewusst eingehe.

### Story 4: Verbindung trennen (Funktional)

**Als** Nutzer, der das Geraet verkauft oder den Provider wechselt,
**moechte ich** mit einem Klick und einer Bestaetigung die Verbindung trennen,
**damit alle** Tokens lokal entfernt sind.

### Story 5: Modell waehlen (Funktional)

**Als** verbundener Nutzer
**moechte ich** aus einer Liste verfuegbarer Codex-Modelle auswaehlen,
**damit ich** das passende Modell pro Nutzungsszenario verwenden kann.

## Success Criteria (Tech-Agnostic)

| ID | Kriterium | Ziel | Messung |
|----|-----------|------|---------|
| SC-01 | Login-Button ist beim ersten Aufruf des Settings-Modal sichtbar und auffindbar | 90 Prozent finden ihn beim ersten Mal | UAT |
| SC-02 | Nach Login zeigt UI Account-Email und Plan-Tier | Email + Plan sichtbar in unter zwei Sekunden | Funktionstest |
| SC-03 | Disclaimer ist vor dem ersten Login lesbar und kennzeichnet das Hauptrisiko | Mind. 95 Prozent der Leser benennen Endpoint-Drift im Nachgespraech | UAT |
| SC-04 | Disconnect-Aktion verlangt Bestaetigung vor Ausfuehrung | Bestaetigungs-Dialog erscheint immer | Funktionstest |
| SC-05 | Modell-Auswahl ist nach Login sofort sichtbar und bedienbar | Dropdown enthaelt mindestens das Default-Modell | Funktionstest |
| SC-06 | Bei Login-Fehler zeigt UI eine konkrete Fehlermeldung | Meldung enthaelt eine von vier Aktionen (Neu einloggen, Abo pruefen, Plugin updaten, Support) | UAT |
| SC-07 | Auf Mobile zeigt UI eine Erklaerung statt Login-Button | Hinweistext "Auf Desktop verfuegbar" sichtbar | Funktionstest |

## Technical NFRs

### Performance

- **Modal-Render**: Settings-Modal oeffnet in unter 300 Millisekunden, auch wenn Provider verbunden ist.
- **Status-Check**: Token-Status-Pruefung lokal, kein Netzwerk-Roundtrip.

### Security

- **Disclaimer-Pflicht**: Beim ersten Login zeigt das Modal einen Disclaimer mit "Verstanden"-Bestaetigung. Bestaetigung wird in `data.json` als Flag persistiert.
- **Disconnect-Confirm**: Disconnect-Button oeffnet Confirm-Modal (analog zu bestehender Convention `feedback_delete_confirmation`).
- **Token-Anzeige**: UI zeigt nie Token-Werte, nur Status (`Verbunden seit`, `Letzte Erneuerung`, `Account`).

### Usability

- **i18n-Bereit**: Alle Texte ueber `t()`-Funktion, deutsche und englische Strings.
- **Tastatur-Bedienbar**: Login- und Disconnect-Buttons via Tab-Navigation erreichbar.
- **Mobile-Hinweis**: Auf Mobile-Plattformen wird Provider zwar angezeigt, aber als nicht waehlbar markiert mit Hinweistext.

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**MODERATE ASR #1: Settings-Modal-Erweiterung**

- **Warum ASR**: Bestehender `ModelConfigModal` hat eine Provider-Block-Struktur. Neuer Block muss sich ohne Refactor einfuegen.
- **Impact**: Neues Sub-Komponenten-File `ChatGptOAuthBlock.ts` analog zu vermutlich existierendem `CopilotBlock`.
- **Quality Attribute**: Maintainability.

**MODERATE ASR #2: Disclaimer-Persistenz**

- **Warum ASR**: Disclaimer-Bestaetigung muss persistiert werden, sodass Nutzer ihn nicht vor jedem Login sieht.
- **Impact**: Settings-Schema bekommt `chatgptOAuth.disclaimerAcknowledgedAt`-Feld.
- **Quality Attribute**: Usability.

### Constraints

- **Review-Bot-Compliance**: Keine `innerHTML`-Aufrufe, nur Obsidian-DOM-API (`createEl`, `createDiv`, `appendText`). Keine inline-Styles, nur CSS-Klassen aus `agent-u-*`.
- **Keine Emojis**: Im UI-Text strikt keine Emojis (Convention: "no emojis in code or UI").
- **Sentence-Case**: UI-Texte in Sentence-Case, kein Title-Case.

### Open Questions for Architect

- Wo lebt der Disclaimer-Text: In einem eigenen Markdown-File oder als Konstante im Code?
- Soll die UI bei Endpoint-Drift einen separaten Status-Badge zeigen (z.B. "Letzte Anfrage fehlgeschlagen") oder reicht die Inline-Fehlermeldung?
- Status-Anzeige: Polling-frei oder mit periodischem Check (z.B. alle 60 Sekunden)?

## Definition of Done

### Funktional

- [ ] Provider-Auswahl-Dropdown enthaelt "ChatGPT (OAuth)"
- [ ] Login-Button funktional, oeffnet Browser
- [ ] Status-Block zeigt Account-Email und Plan
- [ ] Modell-Dropdown enthaelt verfuegbare Codex-Modelle
- [ ] Disconnect-Button mit Confirm-Modal
- [ ] Disclaimer beim ersten Login mit "Verstanden"-Bestaetigung
- [ ] Mobile-Hinweis statt Login-Button auf iOS/Android

### Qualitaet

- [ ] UAT mit fuenf Nutzern
- [ ] Review-Bot-Compliance: kein `innerHTML`, keine inline-Styles, keine Emojis
- [ ] i18n-Strings deutsch und englisch
- [ ] Keyboard-Navigation funktional

### Dokumentation

- [ ] Feature-Spec auf `Implemented` setzen
- [ ] Backlog-Eintrag aktualisieren
- [ ] Doku-Eintrag in `docs/guides/providers/` (Public-Docs)

## Dependencies

- **FEATURE-021-001**: Login-Funktion stammt aus dem OAuth-Service.
- **FEATURE-021-002**: Modell-Liste kommt vom API-Handler.
- **ModelConfigModal**: Bestehende UI-Komponente, wird erweitert.

## Assumptions

- ChatGPT-Account-Email ist im `id_token` enthalten und kann ohne zusaetzlichen API-Call angezeigt werden.
- Plan-Tier (`plus`, `pro`) ist im JWT als Claim verfuegbar.

## Out of Scope

- Account-Switcher (kein Multi-Account)
- Quota-Anzeige (Codex-Backend liefert keine Quota-Info)
- Custom-Disclaimer-Texte
