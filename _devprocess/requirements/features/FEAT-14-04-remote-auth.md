# Feature: Remote Authentication

> **Feature ID**: FEAT-14-04
> **Epic**: EPIC-14 - MCP Connector
> **Priority**: P1-High
> **Effort Estimate**: M

## Feature Description

OAuth 2.1 + PKCE Authentifizierung fuer den Remote MCP-Transport. Stellt sicher
dass nur autorisierte Clients auf den Vault zugreifen koennen.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Unautorisierte Requests abgelehnt | 100% | Security-Test |
| SC-02 | Auth-Flow funktioniert mit claude.ai | Token-Austausch ok | E2E-Test |
| SC-03 | Token-Refresh automatisch | Kein manueller Re-Auth | Langzeit-Test |

## Definition of Done

- [ ] OAuth 2.1 + PKCE Flow
- [ ] Token-Speicherung + Refresh
- [ ] 401 fuer unautorisierte Requests
- [ ] Revoke in Settings

## Dependencies
- **FEAT-14-03**: Remote Transport
