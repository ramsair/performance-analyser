# Performance Analyser (VS Code Extension)

A Visual Studio Code extension for Angular developers that scans TypeScript and HTML files to detect common single-page application (SPA) performance anti-patterns and offers quick fixes. The extension parses your code’s Abstract Syntax Tree (AST) (via `ts-morph`) and surfaces inline diagnostics (Problems pane) plus one-click Quick Fix actions.

---

## Key features

* Static analysis of Angular projects:

  * Detects eager-loaded routes (suggest `loadChildren`)
  * Flags unclosed RxJS subscriptions (`subscribe` without `takeUntil`)
  * Identifies residual `console.log()` statements
  * Warns on namespace imports (`import * as …`)
  * Highlights `window.addEventListener` without cleanup
  * Checks HTML templates for:

    * Missing `loading="lazy"` on `<img>`
    * Non-WebP/AVIF image formats
    * Inline `style="..."` attributes
* Quick-Fix Code Actions:

  * Add `loading="lazy"` to `<img>`
  * Convert common image extensions to `.webp`
  * Remove stray `console.log()` lines
  * (Planned) Suggest `loadChildren`-style lazy loading for routes
* Live diagnostics:

  * Automatically analyzes open/edited files (500 ms debounce)
  * Shows warnings inline and in the Problems pane
* Status bar toggle (Audit On / Off) and full-workspace audit command

---

## Prerequisites

* Node.js (Recommended: 18+; compatible with 20.x)
* npm (matching your Node installation)
* Visual Studio Code (latest stable)
* Recommended VS Code extensions while developing the extension:

  * `amodio.tsl-problem-matcher`
  * `ms-vscode.extension-test-runner`
  * `dbaeumer.vscode-eslint`

> The extension depends on `ts-morph` to parse TypeScript into an AST.

---

## Install / Get started (for users)

To try the extension locally for development:

1. Clone the repo:

   ```bash
   git clone https://github.com/ramsair/performance-analyser/tree/develop
   cd performance-analyser
   ```
2. Install dependencies:

   ```bash
   npm install
   ```
3. Open the folder in VS Code and press `F5` to launch an Extension Development Host window with the extension loaded.
4. In the Extension Development Host, open an Angular project (or the workspace you want to audit) and use the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) to run commands (see **Commands** section).

---

## Contributed Commands

The extension provides (or registers) the following commands. You can run them from the Command Palette:

| Command id                                     | Title (shown in palette) |
| ---------------------------------------------- | ------------------------ |
| `performance-analyser-v1-0-0.runAudit`         | Run Performance Audit    |
| `performance-analyser-v1-0-0.clearDiagnostics` | Clear Diagnostics        |
| `performance-analyser-v1-0-0.helloWorld`       | Hello World              |

> Note: the extension code also registers runtime commands such as a **toggle audit** command (`performance-analyser-v1-0-0.toggleAudit`) and may provide other internal commands — if you want them to appear in `package.json` so VS Code shows them in the UI, add them to the `contributes.commands` array.

---

## Usage (user-facing)

* **Run a full workspace audit:**
  Open the Command Palette → `Performance Analyser: Run Audit`
  A progress notification appears while `.ts` and `.html` files are scanned; results appear in Problems.

* **On-the-fly analysis:**
  Open or edit an Angular `.ts`/`.html` file. After you pause typing (\~500 ms), the extension re-scans the file and updates diagnostics.

* **Apply quick-fixes:**
  Click the lightbulb icon that appears next to a warning in the editor and select a suggested fix (e.g., “Add `loading="lazy"`”).

* **Clear diagnostics:**
  Command Palette → `Performance Analyser: Clear Diagnostics`.

* **Toggle live audits:**
  Click the status bar item labelled `Audit: On` / `Audit: Off` (if available) to enable or disable automatic per-file analysis.

---

## Development (how the project is built)

The `package.json` contains useful scripts. Typical development workflow:

1. Install dependencies:

   ```bash
   npm install
   ```
2. Build / compile:

   ```bash
   npm run compile
   ```

   * This runs type checks, lints, and bundles the extension code (via `esbuild.js` as configured in the project).
3. Package for publishing:

   ```bash
   npm run package
   ```

   * Runs checks, linting, and a production build.
4. Watch mode for iterative development:

   ```bash
   npm run watch
   ```
5. Run tests:

   ```bash
   npm test
   ```

**Available scripts (from package.json)**

* `compile` — run type checks, lint and bundle
* `watch` / `watch:esbuild` / `watch:tsc` — development/watch modes
* `package` — production packaging
* `lint` — run ESLint on `src/`
* `test` — run VS Code extension tests (uses `vscode-test`)
* `check-types` — run `tsc --noEmit`
* `compile-tests`, `watch-tests` — compile tests to `out` folder

> See your `package.json` for exact script names and details.

---

## How it works (high level)

1. When activated, the extension creates a `DiagnosticCollection` (a “notebook” of warnings) and registers commands and file listeners.
2. It scans workspace `.ts` and `.html` files (full audit) or single files (on open/change).
3. For `.ts` files, it uses `ts-morph` to parse the AST and find patterns (e.g., `.subscribe(...)`, `import * as ...`, route definitions).
4. For `.html` templates the extension checks for missing `loading="lazy"`, inline styles, and non-modern image formats.
5. It reports findings as `vscode.Diagnostic` entries (Problems pane) and offers Quick Fix actions via `CodeActionProvider`.
6. A debounce timer (500 ms) avoids re-running heavy checks while the user is actively typing.

---

## Testing & Debugging

* Run extension in a debug host: open the project in VS Code and press **F5**. That opens an Extension Development Host window where you can open projects to analyse.
* Add breakpoints in `src/extension.ts`, `src/tsAuditor.ts`, or `src/htmlAuditor.ts` to step through logic.
* Tests rely on `@vscode/test-cli` / `vscode-test` — see `test/` for examples and `npm test` to execute them.

---

## Packaging & Publishing

To package the extension for marketplace publishing:

```bash
npm run package
# or use vsce (if you prefer)
npm install -g vsce
vsce package
```

Follow the official VS Code docs to publish: [https://code.visualstudio.com/api/working-with-extensions/publishing-extension](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

---

## Troubleshooting

* If diagnostics are not appearing:

  * Ensure workspace files are open and the extension is activated (check Extension Development Host).
  * Confirm the file type is `typescript` or `html`.
* If the extension is slow:

  * Ensure the debounce is working (wait after typing), and consider limiting `findFiles` patterns for large repos.
* If quick fixes don’t apply correctly:

  * The provider uses `WorkspaceEdit` replacements; ensure file contents are not concurrently updated (e.g., by another tool).

---

## Security & privacy

* The extension only reads files from the workspace you open in the Extension Host. It does not upload source code anywhere.

---

## License & attribution

MIT © Ramsai Ummadisetty

`ts-morph` and other third-party libraries are used under their respective licenses. Check `package.json` for the dependency list.

---

## Contact / contributions

Author: Ramsai Ummadisetty — [ramsaiummadisetty@gmail.com](mailto:ramsaiummadisetty@gmail.com)

---

