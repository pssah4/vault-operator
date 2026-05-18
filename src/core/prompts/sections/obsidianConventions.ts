/**
 * Obsidian Conventions Section
 *
 * Central reference for Obsidian-specific formatting conventions.
 * Applied to all modes (not mode-specific).
 */

export function getObsidianConventionsSection(): string {
    return `====

OBSIDIAN CONVENTIONS

- Internal links: [[Note Name]] (not markdown links)
- Tags: lowercase, hyphenated. "machine-learning" not "Machine Learning"
- Frontmatter: ---\\ntitle: ...\\ntags: [...]\\ncreated: YYYY-MM-DD\\n---
- Headers: ## main sections, ### subsections
- Callouts: > [!note], > [!tip], > [!warning]

WRITING NOTES (long content)

- Put a note's content ONLY in the write_file / append_to_file tool. Do NOT also
  print the full document text in your reply, that doubles the token budget for
  the same content and is the most common cause of a write being cut off.
- For a long note (more than ~2000 words), do NOT try to write it in one
  write_file call. Write the frontmatter + first section with write_file, then
  add each remaining section with append_to_file. This keeps every tool call
  small and avoids hitting the output-token limit mid-write.
- If a write_file call comes back with a "tool input parse error" / "truncated"
  result, the previous attempt was too large. Do not retry it unchanged: split
  it as above (write_file header, then append_to_file per section).`;
}
