# UniScientist Compilation & Installation Guide

## 1. Recompiling Changes

### Webview UI Changes (e.g., Start Page, Banners)
If you modified files in `webview-ui/` or `src/shared/` (like `banner.ts`), you must rebuild the webview bundle:

```bash
npm run build:webview
```

### Extension Logic Changes
If you modified the core extension logic (files in `src/` outside of `webview-ui`):

```bash
npm run compile
```

> **Tip:** You can generally run both to be safe, especially if you changed shared code.

---

## 2. Rebuilding the Extension

### Packaging for Installation (.vsix)
To create an installable `.vsix` file:

```bash
npm run package
vsce package --no-dependencies
```
*Note: You may need to install `vsce` globally first via `npm install -g @vscode/vsce`.*

This will produce a `.vsix` file in the project root which you can install in VS Code via "Extensions: Install from VSIX...".

Alternatively, you can install it from the command line:

```bash
code --install-extension uniscientist-3.50.0.vsix
```

### Debugging (F5)
To run the extension in development mode with hot reloading:
1. Open the project in VS Code.
2. Press **F5** (or go to "Run and Debug" and select "Extension").
3. This will launch a new "Extension Development Host" window running your modified code.
4. Background compilation tasks (`npm run watch`) should start automatically.

---

## 3. Installing CLI

### Local CLI Installation
To build the CLI from source and link it to your system PATH (so `uniscientist` and `uni` commands work globally):

```bash
./scripts/install-uniscientist-local.sh
```

This script will:
1. Compile the Protocol Buffers.
2. Build the Go binaries.
3. Link the binaries to `/usr/local/bin`.

### "Install" Action from Start Page
The "Install" button on the start page (if you choose to use it) executes:
```bash
npm install -g uniscientist
```
This installs the package from the npm registry, not your local source. **Use the script above for local development.**
