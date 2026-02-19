# TaskVision

**[中文文档](README_zh.md)** | English

---

**TaskVision** is a powerful visual enhancement extension for VS Code designed to revolutionize how you track comments and TODOs. It combines efficient search capabilities with stunning visual styles—including **Neon Glow** and **Frosted Glass** effects—helping you manage technical debt and tasks effectively.

## ⚡ Quick Start

Want to experience the best visual effects immediately? Just copy the following configuration into your `settings.json`:

```json
"taskvision.highlights.customHighlight": {
    "TODO": {
        "icon": "check",
        "foreground": "#42A5F5", // Blue
        "scheme": "neon+glass",   // Activate Neon + Glass dual effect
        "type": "text"            // Highlight tag and subsequent text
    },
    "FIXME": {
        "icon": "alert",
        "foreground": "#FF5252", // Red
        "scheme": "neon",        // Activate Neon Glow only
        "type": "tag"            // Only tag glows
    },
    "HACK": {
        "icon": "beaker",
        "foreground": "#AB47BC", // Purple
        "scheme": "glass",       // Activate Frosted Glass only
        "type": "line"           // Highlight whole line
    }
}
```

Save it, and your code comments will look brand new!

## ✨ Key Features

*   **Ultimate Visual Experience**:
    *   **Neon Mode**: Glowing text effects make key information pop, especially in dark themes.
    *   **Glass Mode**: Modern, translucent background blocks providing a frosted glass aesthetic (iOS/macOS style).
    *   **Neon + Glass**: The ultimate visual combination for hierarchy and style.
        *   **New**: Supports **"Tag Only"** mode. In this mode, the tag (e.g., `TODO`) glows according to settings, while the subsequent comment text retains its original syntax highlighting color, completely solving the "gray text" issue without affecting readability.
*   **Powerful Tree View**:
    *   Automatically scans the workspace for TODO, FIXME, etc. tags.
    *   View grouped by **File**, **Tag**, or **Flat List**.
    *   Click to jump directly to code location.
    *   Export tree content to file.
*   **Highly Customizable**:
    *   Define custom tags (TODO, FIXME, HACK, NOTE, etc.).
    *   Set individual colors, icons, styles, and visual schemes for each tag.
    *   Supports custom regex matching rules.
*   **Performance Optimized**:
    *   Uses Ripgrep for finding tags extremely fast.
    *   Optimized rendering logic ensures glow and color effects remain stable even while editing comments.

## 📸 Screenshots

> [!NOTE]
> *(User to insert screenshots here: demonstrating Neon Mode, Glass Mode, and Neon+Glass combination)*

## 🚀 Installation

You can install the latest version of the extension via the Visual Studio Marketplace.

Alternatively, open Visual Studio Code, press `Ctrl+P` (or `Cmd+P` on Mac) and type:

```bash
ext install taskvision
```

## ⚙️ Detailed Configuration

TaskVision provides rich configuration options. You can adjust colors, icons, and behavior in your `settings.json`.

### 1. Highlight Settings (Highlights)

This is the core visual configuration section.

*   **`taskvision.highlights.defaultHighlight`**: Global default settings for all tags.
*   **`taskvision.highlights.customHighlight`**: Specific settings for individual tags.

**Available Attributes**:
*   `foreground`: Font color (supports Hex, RGB, or Theme Color Names).
*   `background`: Background color.
*   `icon`: Icon shown in the tree view (supports Octicons, e.g., "check", "alert", "beaker", "bug", "flame").
*   `iconColour`: Set specific icon color.
*   `type`: Highlight range.
    *   `tag`: Highlights only the tag itself (Recommended for Neon mode).
    *   `text`: Highlights the tag and subsequent text.
    *   `line`: Highlights the entire line.
    *   `whole-line`: Highlights the entire line (full editor width).
*   `scheme`: **[Important]** Visual scheme selection.
    *   `neon`: Neon glowing text effect.
    *   `glass`: Frosted glass background effect.
    *   `neon+glass`: Combined effect.
*   `opacity`: Background opacity (0-100).
*   `borderRadius`: Background border radius (e.g., "4px").
*   `gutterIcon`: Show icon in the gutter (`true`/`false`).
*   `rulerColour`: Color of the marker on the scrollbar (overview ruler).
*   `rulerLane`: Position of the marker on the scrollbar (`left`, `center`, `right`, `full`).

### 2. General Settings (General)

*   **`taskvision.general.tags`**: Defines the list of tags to search for.
    *   Default: `["TODO", "FIXME", "BUG"]`
*   **`taskvision.general.tagGroups`**: Tag grouping settings. Group multiple tags (e.g., `FIXME`, `FIXIT`) under one display node.
*   **`taskvision.general.debug`**: Whether to show debug info in the output panel.
*   **`taskvision.general.statusBar`**: Status bar display content (`total`, `tags`, `top three`, `current file`, `none`).
*   **`taskvision.general.statusBarClickBehaviour`**: Status bar click behavior (`toggle highlights`, `reveal`, `cycle`).

### 3. Tree View Settings (Tree)

*   **`taskvision.tree.scanMode`**: Scan mode.
    *   `workspace`: Scan entire workspace (default).
    *   `open files`: Only scan open files.
    *   `current file`: Only show current file.
*   **`taskvision.tree.showCountsInTree`**: Show counts next to tree nodes.
*   **`taskvision.tree.labelFormat`**: Custom label format (e.g., `${tag} ${after}`).
*   **`taskvision.tree.expanded`**: Expand all nodes by default.
*   **`taskvision.tree.flat`**: Use flat list view (no folder hierarchy).
*   **`taskvision.tree.grouped`**: Group by tag.
*   **`taskvision.tree.sortTagsOnlyViewAlphabetically`**: Sort tag view alphabetically.

### 4. Regex & Multiline Support (Regex)

TaskVision uses regex to find tags in comments.

*   **`taskvision.regex.regex`**: Regular expression for matching TODOs.
    *   Default includes support for `//`, `#`, `;`, `<!--`, and more.
    *   `($TAGS)` in the regex is automatically replaced by the content of `general.tags`.
*   **`taskvision.regex.enableMultiLine`**: Enable multiline matching (Experimental).
*   **`taskvision.regex.regexCaseSensitive`**: Case sensitive matching (default `true`).

### 5. Filtering (Filtering)

*   **`taskvision.filtering.includeGlobs`**: Only include files matching specific paths.
*   **`taskvision.filtering.excludeGlobs`**: Exclude files matching specific paths (Default: `["**/node_modules/*/**"]`).
*   **`taskvision.filtering.passGlobsToRipgrep`**: Pass globs to Ripgrep for better performance.
*   **`taskvision.filtering.ignoreGitSubmodules`**: Ignore git submodules.

## ⌨️ Commands

Press `F1` or `Ctrl+Shift+P` to open the command palette and type `TaskVision` to see all commands:

*   **TaskVision: Add Tag**: Add a new search tag.
*   **TaskVision: Remove Tag**: Remove a search tag.
*   **TaskVision: Scan Workspace**: Manually trigger a workspace scan (use if auto-refresh doesn't pick up changes).
*   **TaskVision: Export Tree**: Export the current TODO list to a file (JSON or Text).
*   **TaskVision: Switch Scope**: Switch between predefined search scopes.
*   **TaskVision: Go To Next/Previous**: Jump to the next/previous TODO in the current file.
*   **TaskVision: Show/Hide Tree View**: Toggle tree view visibility.

## ❓ FAQ

**Q: In "Neon+Glass" mode, why didn't the comment text match my color setting?**
A: Check your configuration. In the latest version, we fixed this issue. As long as your `type` is set to `tag` or `text`, the extension automatically ensures the text color follows your `foreground` setting instead of reverting to the gray default comment color.

**Q: Does the glow disappear when editing comments?**
A: No. We optimized the caching mechanism to ensure the glow functionality remains stable during editing.

**Q: Why can't I find my TODOs?**
A: Check:
1. Is the file excluded in `excludeGlobs` (e.g., `node_modules`)?
2. Is the tag added to `taskvision.general.tags`?
3. Try running `TaskVision: Scan Workspace` to manually refresh.

---
**Credits**: Based on the excellent work of [Todo Tree](https://github.com/Gruntfuggly/todo-tree).
