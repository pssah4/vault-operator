/**
 * buildSubprocessEnv -- shared minimal env for spawn() callers.
 *
 * The plugin spawns helper binaries in two places:
 *   1. ExecuteRecipeTool (user-configured CLI recipes)
 *   2. pptxRenderer (LibreOffice headless PPTX -> PDF conversion)
 *
 * Both deliberately do NOT inherit the parent's full process.env. That
 * would forward API keys and session tokens into untrusted recipe
 * binaries. Instead we hand the child a minimal env: the search PATH
 * so the binary's dependencies resolve, HOME (or USERPROFILE on
 * Windows) so the binary can read its per-user config (npm rc,
 * LibreOffice profile, etc.), LANG to force UTF-8 output, and
 * SYSTEMROOT on Windows because Win32 APIs require it.
 *
 * The HOME / USERPROFILE / SYSTEMROOT reads look like "identity
 * environment variables" to static analyzers (e.g. the Obsidian
 * Community Plugin review bot), but they are NOT used for
 * fingerprinting and are not transmitted anywhere -- the values only
 * cross the spawn boundary into the child process. Concentrating the
 * reads in this single helper makes the intent explicit and means
 * future spawn callers don't need to repeat the pattern.
 */

export function buildSubprocessEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        LANG: 'en_US.UTF-8',
    };
    if (process.platform === 'win32') {
        // Windows: USERPROFILE is the canonical user-home variable; HOME
        // may be set by Git Bash etc. SYSTEMROOT is required by many
        // Win32 APIs and CLI tools.
        if (process.env.USERPROFILE) env.USERPROFILE = process.env.USERPROFILE;
        if (process.env.HOME) env.HOME = process.env.HOME;
        if (process.env.SYSTEMROOT) env.SYSTEMROOT = process.env.SYSTEMROOT;
    } else if (process.env.HOME) {
        env.HOME = process.env.HOME;
    }
    return env;
}
