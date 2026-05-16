# Contributing to Vault Operator

Thanks for taking the time to help improve Vault Operator. The fastest way to contribute today is to file high-quality issues on GitHub. Pull requests are welcome but not required, and most fixes start from a good bug report.

All issues live in the public repository:

[github.com/pssah4/vault-operator/issues](https://github.com/pssah4/vault-operator/issues)

Please search existing issues first to avoid duplicates. If you find a matching one, add a comment with your context instead of opening a new issue.

## Reporting a bug

Open a new issue using the **Bug report** template and include the following information. The more concrete you are, the faster the issue can be reproduced and fixed.

### 1. What happened

A clear description of the actual behavior. Avoid interpretations like "the agent broke", describe what you saw on screen, in the sidebar, or in a generated note.

### 2. What you expected

What should have happened instead.

### 3. Steps to reproduce

Numbered steps starting from a clean state, for example:

1. Open the Vault Operator sidebar.
2. Type the prompt "summarize my Inbox folder".
3. Approve the first `read_file` call.
4. Observe the error message in the sidebar footer.

If the bug depends on a specific note, attach a minimal example. Do not paste private content.

### 4. Technical setup

This block is mandatory for bug reports. Without it most issues cannot be reproduced.

- Operating system and version: Windows 11, macOS 14.5, Ubuntu 24.04, etc.
- Obsidian version: see Obsidian Settings, About, Current version.
- Vault Operator version: see Obsidian Settings, Community plugins, Vault Operator, or the `version` field in `manifest.json`.
- Installer type: regular install, BRAT pre-release, or manual install.
- AI provider in use: Anthropic, OpenAI, Bedrock, OpenRouter, GitHub Copilot, Ollama, etc., plus the configured model.
- Whether the vault is in iCloud, OneDrive, Obsidian Sync, or local-only.

### 5. Console logs

For runtime errors, attach the developer console log as text. This is the single most useful piece of information for debugging.

How to open the developer console in Obsidian:

- **macOS:** press `Cmd` + `Option` + `I`.
- **Windows / Linux:** press `Ctrl` + `Shift` + `I`.

Then:

1. Switch to the **Console** tab in the DevTools window that opens.
2. Reproduce the bug while the console is open, so the error is captured.
3. Right-click anywhere inside the console output and choose **Save as...** to export the full log, or select all entries and copy them.
4. Paste the log into the issue as a fenced code block:

   ````
   ```text
   <paste console output here>
   ```
   ````

If the log is long, attach it as a `.txt` file instead of pasting it inline. Redact tokens, API keys, or private note content before posting.

Tip: Vault Operator also keeps its own per-day agent log. You can export it from Obsidian Settings, Vault Operator, Logs, **Download**. Attach this file in addition to the console log when the issue is about a specific agent run.

### 6. Screenshots

For any bug that is visible in the UI (sidebar, settings tabs, modals, generated notes, canvas, office documents), attach a screenshot. Crop to the relevant area and annotate if helpful. Drag the image into the GitHub issue editor to upload it.

## Requesting a feature

Open a new issue using the **Feature request** template. Include:

- **Problem.** What are you trying to do, and what gets in the way today? Concrete user scenarios work better than abstract wishes.
- **Proposed solution.** How you imagine it should work. A rough description is enough.
- **Alternatives.** Workarounds you already tried, or related features that partially solve the problem.
- **Context.** Vault size, workflow, provider, and any other detail that explains why this matters in your setup.
- **Screenshots or mockups.** For anything UI-related, attach a sketch or screenshot of the area you want to change. Hand-drawn mockups are fine.

## Requesting an improvement

Use the **Improvement** template for changes to existing features that are not bug fixes (clearer wording, better defaults, smaller UX polish, internal cleanup). The structure is the same as a feature request, just smaller in scope.

## Security issues

Do not file security issues as public GitHub issues. See [SECURITY.md](SECURITY.md) for the disclosure process.

## Code contributions

Pull requests are welcome. Before sending a PR, please open an issue first so we can agree on scope and approach. Vault Operator follows the Obsidian Community Plugin review rules strictly, so PRs that introduce `console.log`, `fetch`, `innerHTML`, `any`, or other forbidden patterns will not be merged. See [REVIEWER_NOTES.md](REVIEWER_NOTES.md) for the full list.

## Thank you

Every well-prepared bug report saves hours of debugging. Thanks for helping make Vault Operator better.
