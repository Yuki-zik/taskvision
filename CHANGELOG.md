# TaskVision Change Log

## 3.8.1 Preview - source-anchored guidance draft isolation

- Fixed a reproducible data-integrity issue: creating draft guidance for two different lines of the same file no longer reuses the first line's content or anchor.
- New drafts are keyed by workspace, source path and selected line. Existing annotation drafts still use their stable annotation IDs.
- Compatible older path-only drafts migrate to the matching source line after persistence succeeds. Mismatched legacy drafts are preserved instead of being consumed by unrelated anchors.
- Added real Chrome regression tests for multi-line draft isolation, reload persistence and legacy draft migration; all 10 project workflow E2E tests and 182 original VS Code, 64 core/MCP and 107 Web tests passed.
- Local preview only: no change to SQLite schema, MCP tools, remote repository, Marketplace or the daily VS Code extension.


## 3.8.0 Preview - heritage neon and one-click source details

- Returned to the original GitHub screenshot visual language: near-black canvas, localized neon label glow, translucent thin full-line glass boundaries. Replaced generic light administrative popovers with restrained dark acrylic surfaces.
- CORE/REUSE/INTENT/REVIEW now ship with their existing semantic blue/green/violet/amber colors, neon+glass scheme, tag-only glow (56%), whole-line outline (34%) and 9% translucent line tint. This changes shipped defaults, not existing user configuration overrides.
- New Web projects default to dark heritage neon; saved Light/System choices remain effective. Actual light mode and OS-following mode continue to work.
- Single-click any module/file to open a screen-sized floating detail card near that node, showing true summary, files/LOC, relationships, knowledge tags, source-anchored annotation preview, owner/review status and real actions. Escape/outside click dismiss, Enter opens, double click drills without automatic fixed-inspector resizing. Minimized hover overlays.
- Native VS Code Activity Bar tree title prioritizes Open Workspace, Refresh and Quick Actions; grouped picker gives task, appearance, source, agent/MCP and settings workflows. All original context menus/commands remain. Native real editor and task tree were verified with an isolated VSIX/VS Code GUI, not solely command existence.
- Fixed invalid native gutter icon defaults for CORE/REUSE and suppressed misleading implicit idea-status prefixes for knowledge tags while preserving true explicit statuses. Appearance pickers await actual settings updates.
- Added source-anchored UI/keyboard/mobile tests and default-neon source tests. Isolated Shiki grammar initialization and prewarmed comment scopes to stabilize first syntax load under concurrent language requests.

## 3.7.0 Preview

- Added opt-in local project registration, per-tab project switching and isolated source/knowledge/Review operations without mutating a global active workspace.
- Added atomic 0700/0600 private user preferences for approved roots, theme, navigation and inspector layout, per-project graph positions and camera.
- Added actual light/dark/system styles, repositionable/resizable inspector, keyboard-operable splitters and restore-default controls.
- Integrated lazy TextMate/Shiki syntax into the read-only code inspector with TaskVision manifest-defined decoration scopes and optional VS Code user overrides.
- Added multi-root Git/server validation, user preference security and real Chrome multi-project/theme/layout/source tests; all original MCP and editor behavior retained.
- Corrected cross-project JSON export to bind to the currently selected registered project, with an actual browser download and isolation assertion.
- Preserved exact dark VS Code annotation colors; adapted light-mode low-contrast tag bodies to at least 4.5:1 on a white code background. Tested system themes, left-dock keyboard resizing, and persisted node positions.

## 3.6.0 Preview

- Introduced Graph Studio's coherent dark workbench, readable source-backed card facts and all nonzero knowledge chips.
- Added flow/rounded/direct connection presentation plus an explicit semantic legend; direct mode warns that it does not avoid nodes.
- Ordered port fans by nearby routed approach/departure, fixing the actual MCP→core/shared braid; normalized socket perimeter measurement without accepting genuinely stale routes.
- Removed flattened mid-curve tangents, cleaned grid retraces, reduced arrowheads, and preserved refined ports through polling.
- Separated readable85% initial view from full-map fitting; made the minimap opt-in to avoid obscuring node facts.
- Preserved editor/MCP/review behavior; added contrast, filter-state, local geometry and real-browser interaction regressions.

## 3.5.0 Preview

- Separated dependency edges into stable physical ports on both endpoints, shared by the source model, ELK and React Flow.
- Added smooth cubic connections in clear corridors and independently routed Smart Edge A* waypoints around other modules.
- Applied stable importer colors to overview cables and retained true relation-kind colors in category mode.
- Preserved source evidence, arrow direction, impact analysis, keyboard navigation and endpoint geometry while isolating an active wire.
- Added real core fan-in tests, A* obstacle-corridor tests and end-to-end graph drag/poll/focus tests without introducing another graph runtime.
- Exposed the physical limit for extremely high-degree nodes rather than silently dropping dependencies.

## 3.4.0 Preview

- Adopted actual MIT React Flow UI BaseNode and NodeTooltip registry source, with hashes and attribution.
- Added scoped Tailwind utilities without a global reset; kept other workbench screens intact.
- Added canvas-first overview, compact measured node geometry, contextual zoom and wider ELK separation.
- Preserved source-linked relation evidence, impact analysis and all node source/drill/expand actions.
- Added Floating UI boundary avoidance for screen-sized node details/actions and repaired keyboard focus restoration.
- Added real browser acceptance for laptop readability, low-zoom interaction, viewport collision and keyboard return paths.

## 3.3.0 Preview — React Flow UI-inspired architecture node system (2026-10-26)

- Redesigned the Web architecture **module cards and file cards** using first-party MIT React Flow UI Base Node's header/content/footer composition while keeping existing React Flow v12, ELK, Smart Edge, native CSS and current Workbench theme. **No invasive Tailwind/shadcn migration or new runtime dependency.** LikeC4 informed architecture hierarchy, not copied implementation code.
- Module cards distinguish real namespace, shortened module name, actual file count, two-line source-grounded summary, semantic annotation tags/overflow and review/Agent scope. File cards show basename, parent path, file type, original source links and bounded content; expanded/detailed variants retain all callbacks, tooltips and accessibility labels.
- Improved focus/hover/selected states, module/file and infrastructure role contrast with a restrained color palette and more readable type. Node/ELK dimensions agree at every density.
- Corrected first-fit clipping after enlarging nodes by adjusting padding and minimap inset; desktop 1440×960 has all eight code modules visible without minimap overlap. Smaller window fit dynamically relaxes the 75% zoom floor rather than clipping graph nodes; pan/zoom remains available for reading details.
- Added real Chrome node card UX tests: geometry and content overflow, source navigation, module expansion, file cards, three viewport sizes and regression of the original knowledge/Review flows.

## 3.2.1 Preview — Historical Review compatibility and trustworthy UI

- Fixed an observed 2.1.0-era pending Review returning HTTP 403 after previously reviewed files became Git-ignored. Current safe paths remain available in modern reviews; excluded content and paths never appear in the detail payload.
- A legacy Review lacking claim-time before/after source now returns only its decision metadata and Agent-reported evidence, with no live-source substitution. UI clearly shows old vs current commit, hides unverifiable Diff, disables approval and keeps human **要求修改** available. Existing review records stay pending until a human acts.
- Human approval also validates that a complete baseline and submitted source are stored, even if repository HEAD is unchanged. Symlink/ignored-source regressions fail closed, and partial modern reviews show only safe readable files without approving the whole change.
- Historical detail payload was reduced from about 730 KB / 1.9s to about 1.1 KB / 2–5ms on the real TaskVision workspace, by avoiding irrelevant source scans when no baseline exists.
- Added historical/ignored-source behavior tests and real Chrome Review workflows without changing normal valid code-review behavior.

## 3.2.0 Preview — Source-grounded Dependency Impact Lens (2026-10-26)

- Borrowed CodeMap's direct dependency, reverse dependency and transitive possible-impact explorer while **retaining original importer → provider arrows**. A change's potential reachability is not a statement of runtime failure.
- Added a compact context toolbar with 全图 / 它依赖 / 依赖它 / 潜在影响 / 一跳邻域, direct/indirect counts and non-disruptive node/edge highlighting. Zoom and remembered positions stay intact when switching lenses.
- Preserved impact target through module expansion, keyboard Enter/Space selection and edge evidence inspection. Narrow screens can close the existing source-detail drawer to return to the graph.
- Added deterministic D2 source export and reusable ELK geometry measurement for reproducible layout comparison, with 6 self-tests. **TALA is available officially but was not executed** because the binary/WASM could not be downloaded; production continues using the verified ELK + Smart Edge stack.
- Added source-grounded impact tests and a real browser workflow alongside original plugin, MCP and graph regression tests.

## 3.1.0 Preview — Semantic Architecture Graph (2026-10-26)

- Adopted the MIT React Flow Smart Edge v5 worker-based obstacle router, preserving React Flow and ELK layout.
- Source-derived links now distinguish runtime imports, type-only imports, re-exports, `require()`, dynamic imports and lexical fallback, with 1-based source line, exact specifier and provenance.
- Default overview **summarizes multiple kinds between the same directed module pair**; switch to **分类** to expand separate paths. Category filters and counters stay grounded in actual source references.
- Click or keyboard-open a link to inspect the source/target, grouped evidence, actual counts and source location. No fabricated code-call or data-flow relations.
- Improved module/file styling, rounded obstacle-avoiding paths, initial-fit timing, viewport retention and responsive source browsing.
- Compared LikeC4, CodeCanvas, D2/TALA, CodeMap, AntV G6/X6 and dependency-cruiser for future reuse; see `agent/semantic-graph-oss-review.md`. D2/TALA remains a future isolated comparison, not a hidden new runtime dependency.

## 3.0.0 Preview

- Migrated extension, knowledge core, HTTP/MCP/CLI and Web source to strict TypeScript with shared contracts.
- Replaced the hand-written graph with React Flow and ELK; added architecture drilldown, source-linked knowledge and version-preserving editing.
- Added incremental AST-backed JS/TS indexing, portable knowledge import previews, proposal adoption and captured review diffs.
- Added real Codex/Skill/MCP acceptance with two scoped worktrees, mid-task guidance, conflict rejection and durable private lease recovery.
- Replaced duplicated build paths with esbuild/Vite; retained old task/highlight/context-export behavior.
- Preserved inherited license notices and packaged third-party notices.

## Unreleased

### 2.1.0 local preview (2026-10-25)

- Add CORE, REUSE, INTENT and REVIEW semantic tags through the existing parser, tree and highlight pipeline.
- Add an opt-in local knowledge workspace with project mapping, source inspection, human guidance editing, scoped tasks and review queue.
- Add shared Node22 SQLite coordination, expiring fenced leases, optimistic writes, source fingerprints, real MCP/CLI and a dedicated Agent Skill.
- Preserve existing user tags and keep new services off until explicitly opened. Ship the MCP dependency bundle in the VSIX.
- Add real protocol/security/worktree/multiprocess tests and installed Extension Host acceptance. Fix existing optional-channel/provider/highlight-cache disposal problems found during that acceptance.
- Preview only: no Marketplace release, cross-device sync, autonomous agent scheduler or automatic Git persistence of Web notes.

- Detect `TODO`/`FIXME` (and other tags) in `%`-style comments used by LaTeX, Matlab and Erlang by adding `%` to the default detection regex. (#3)

## v2.0.1 - 2026-02-21

- Fix image URL warning during extension packaging by updating package.json repository field.
- Update README documentation with new screenshots.

## v2.0.0 - 2026-02-18

- Forked from Todo Tree.
- Refactored core to use a four-channel highlight model (`colorType`, `glowType`, `glassType`, `fontType`).
- Changed `type` scope to be deprecated for styling.
- Added support for multiple, simultaneous highlight visual ranges, including full-line backgrounds and neon text glows.

## v0.0.224 - 2023-02-09

- Remove filewatcher functionality
- Add a simple mechanism to watch for git repo changes instead of using the file watcher
- Add a simple periodic refresh

## v0.0.223 - 2023-02-01

- Flash the line containing the TODO when clicking on items in the tree view
- Fix go to next/previous TODO commands when regex matches the starts of the line
- Deprecate file watcher settings and remove from the README.md

## v0.0.222 - 2023-01-23

- Add commands to move to next and previous TODO in a file

## v0.0.221 - 2023-01-22

- Add default octicons for custom highlights (thanks to [Andrew Hlynskyi](https://github.com/ahlinc))
- Always show total in the activity bar regardless of other settings
- Add support for hiding counts from the activity bar badge
- Fix auto refresh when closing file (thanks to [yw662](https://github.com/yw662))
- Fix scopes documentation (thanks to [kjo-sdds](https://github.com/kjo-sdds))
- Update node_modules exclude to match VSCode (thanks to [Benas Svipas](https://github.com/svipas))

## v0.0.220 - 2022-11-07

- Fix missing 'new' keywords (thanks to [Elias](https://github.com/Elias-Graf))
- Fix duplicate entries when refreshing and files have unsaved changes (thanks to [Chris Bain](https://github.com/baincd))
- Fix issue with duplicate items (thanks to [Matt Toigo](https://github.com/mtoigo))
- Update octicons and fix todo tree icons (thanks to [Morgan](https://github.com/morgansliman))

## v0.0.219 - 2022-10-14

- Add activity bar badge support, but default to off and only for versions 172+ of vscode

## v0.0.218 - 2022-10-14

- Back out activity bar badge option for older versions of VSCode

## v0.0.217 - 2022-10-13

- Update minimum VSCode version to 1.172

## v0.0.216 - 2022-10-13

- Add support for activity bar badge

## v0.0.215 - 2022-01-04

- Update default regex in README.md
- Add "none" as a valid value for highlight type
- Add default icons for default tags
- Add markdown tags to default tag list
- Update screenshot in README.md
- Look for new location of VSCode's packaged ripgrep when the default setting is used

## v0.0.214 - 2021-09-07

- Build codicon list automatically
- Support highlighting from capture groups in the regex
- Fix default regex to not greedily match newlines
- Update default regex
- Fix group by tag
- When grouping by tag, don't add group node for single item
- Ensure markdown update popup is hidden for current session too
- Use entire URI for editor ID when highlighting
- Only show reveal button when not in tags only view
- use subtag match correctly
- Only show total count in title if tree counts are enabled

## v0.0.213 - 2021-04-27

- Remove some old migration code (before version 168)
- Fix colour validation
- Improve status bar layout
- Fix missing URI in multi line TODOs
- Add icon validation

## v0.0.212 - 2021-04-26

- Use the window icon for workspaces in the tree
- Move 'schemes' setting from highlights to general (and include "ssh" by default)
- Use URIs instead of file paths to improve support for remote file systems
- Fix group by tag in flat mode
- Show icons on status bar for each tag count
- Use tag order in status bar, unless showing top three
- Use tag order when grouping by tag

## v0.0.211 - 2021-04-09

- Fix file opening on Windows

## v0.0.210 - 2021-04-08

- Indicate current scope selection when changing
- Make reveal behaviour more consistent with VSCode

## v0.0.209 - 2021-03-28

- Add support for scopes, allowing predefined sets of globs to be selected, (thanks to [kkckkc](https://github.com/kkckkc))
- Add support for manually enabling multiline TODO support
- Improve multi-line todo handling
- Fix broken file icons in tree
- Fix missing filename when using compact folders

## v0.0.208 - 2021-03-20

- Revert commit which removed trailing text from multiline TODOs

## v0.0.207 - 2021-03-19

- Improve colour validation for icons
- Fix theme colours for ruler colour
- Remove trailing block comments when adding multiline todo to tree
- Support multi-line haskell comments
- Don't include trailing text to the end of multiline TODOs

## v0.0.206 - 2021-03-17

- Sort tags only view on tags order by default
- Ignore case when validating HTML colour names
- Allow highlights to be enabled/disabled by clicking the status bar
- Add ruler opacity setting
- Improve view title

## v0.0.205 - 2021-03-13

- Add support for VSCode issue reporter
- Fix highlights in split editors

## v0.0.204 - 2021-03-11

- Add improved markdown support dialog and settings update
- Fix expanded node storage after resetting cache

## v0.0.203 - 2021-03-10

- Fix highlighting of markdown TODOs
- Fix reversed sort order

## v0.0.202 - 2021-03-08

- Improve tag extraction when regex doesn't contain $TAGS
- Fix sorting (again)

## v0.0.201 - 2021-03-04

- Fix 'afterOfBefore' substitution

## v0.0.200 - 2021-03-04

- Add VS Code theme color reference link (thanks to [tksh164](https://github.com/tksh164))
- Add support for label (and tooltip) transformations (thanks to [TomFreudenberg](https://github.com/TomFreudenberg))
- Sort tags only view be label, not tag

## v0.0.199 - 2021-02-28

- Use storageUri instead of deprecated storagePath (v2)
- Add `**/node_modules` to default exclude globs
- Add support for removing trailing comment marker from .vue files (treated as HTML)
- Add context menu details to README.md

## v0.0.198 - 2021-02-25

- revert commit which replaced deprecated storage path

## v0.0.197 - 2021-02-24

- Add filter icon to filters active info node
- Fix missing context flag for show export button
- Implement a sub tag regex (based on work by[calw20](https://github.com/calw20))
- Support opening a URL by clicking on the sub tag in the tree
- Wait for startup to finish before starting extension
- Re-enable hideTreeWhenEmpty option
- Add delay before hiding tree when empty to prevent view disappearing on refresh
- Allow use of alternative "iconColor" in highlights configuration
- Add support for grouping by sub tag
- Add more commands to tree view context menu
- Add support for highlighting sub tags
- Use storageUri instead of deprecated storagePath
- Don't override rgba alpha value if opacity is unset

## v0.0.196 - 2021-01-21

- Fix compact folders when grouping by tag
- Fix description of 'hide tree when empty' option
- Add support for total todo count in view title
- Temporarily disable hideTreeWhenEmpty (Will be re-enabled after January release of VSCode)

## v0.0.195 - 2021-01-20

- Fix icon colour check
- Fix coloured octicons

## v0.0.194 - 2021-01-18

- Make storage folder creation (if required) more robust
- Improve icon colouring under error conditions
- Add localization support for zh-cn (thanks to [loniceras](https://github.com/loniceras))
- Add context menu option to toggle compact folders

## v0.0.193 - 2020-12-31

- Add support for a simple colour scheme to apply to the highlights
- Default to 'TODO' if all tags are removed
- Add some icons to the scan mode and nothing found messages
- Extend information about `($TAGS)`
- Fix icons in README.md

## v0.0.192 - 2020-12-10

- Use unique filenames for pattern files
- Fix disappearing icon

## v0.0.191 - 2020-12-09

- Fix showing tree view when clicking status bar
- Change default setting of hideTreeWhenEmpty to false

## v0.0.190 - 2020-12-08

- Fix showInExplorer setting migration

## v0.0.189 - 2020-12-07

- Remove showInExplorer setting and associated view (thanks to [tristan957](https://github.com/tristan957))
- Change activation event to onStartupFinished
- Add option to disable use of pattern file

## v0.0.188 - 2020-11-10

- revert "Add word boundary after tags in default regex"

## v0.0.187 - 2020-11-09

- Fix hide tree when empty setting
- Improve filter removal dialog
- Update to latest octicons
- Allow theme colours to be used for codicons (octicons are not supported)
- Add word boundary after tags in default regex

## v0.0.186 - 2020-10-25

- Fix badly published version

## v0.0.185 - 2020-10-25

- Add support for hiding individual files
- Add dialog for removing folder filters
- Add timestamps to debug logging

## v0.0.184 - 2020-10-25

- Update theme colour names
- Fix case sensitivity on tag matching
- Use pattern file to avoid extra escaping of the regex
- Add option to disable sorting the tree to allow ripgrep sorting arguments to be used instead
- Add note to README.md about lack of codicon support for gutter icons
- Fix debug logging in ripgrep.js
- Add option to show scan mode in tree view
- Add option to scan workspace only
- Override Markdown comment detection with HTML comments

## v0.0.183 - 2020-10-06

- fix ripgrep link in README.md (thanks to [pke](https://github.com/pke))
- Remove extension.js.map from bundle
- Add context menu options to toggle badges and item counts
- Fix counts in tree when hideFromStatusBar is enabled
- kill ripgrep on deactivate
- Allow rgb and rgba colour definitions

## v0.0.182 - 2020-10-03

- Fix hidden file test
- Bundle the extension
- Fix colour validation

## v0.0.181 - 2020-10-01

- Revert change to remove node modules

## v0.0.180 - 2020-10-01

- Grey out expand/collapse buttons instead of hiding them
- Don't export status node in tree
- Fix tags extraction
- Fix hidden file test

## v0.0.179 - 2020-07-22

- Fix case sensitivity issue with root folder in Windows (thanks to [cobey](https://github.com/cobey))
- Add validation of colours in settings

## v0.0.178 - 2020-07-08

- Fix octicons link in README.md (thanks to [VictorHAS](https://github.com/VictorHAS))
- Fix tooltipFormat always displaying default (thanks to [jasonericdavis](https://github.com/jasonericdavis))
- Add missing 'default' in README.md (thanks to [rhynodesigns](https://github.com/rhynodesigns))
- Simplify export function

## v0.0.177 - 2020-06-16

- Allow buttons in tree view title to be configured
- Add export button to tree view title
- Use Code's codicons for title bar instead of custom icons
- Don't include files without extensions as hidden files
- Fix line numbers in export
- Add file path in tags only view export
- Don't include filtered nodes in tree counters
- Support configurable export path

## v0.0.176 - 2020-05-20

- Only scan workspaces with "file" scheme
- Add option to include hidden files
- Order configuration settings alphabetically in package.json
- Remove leading comments from multiline TODOs
- Update README.md with 'current file' status bar details

## v0.0.175 - 2020-05-13

- Remove migration code for version 0.0.161
- Add spaces and commas to status bar item
- Update to latest version of micromatch

## v0.0.174 - 2020-04-29

- Fix "Nothing found" indicator
- Remove colon from status bar when single counts are shown

## v0.0.173 - 2020-04-24

- Improve handling of tree view status item (showing active filters)
- Fix link to codicons in README.md
- Don't show 'None Found', just use '0' to keep the status bar item short
- Support removal of block comments in .jsonc files

## v0.0.172 - 2020-04-13

- Add "current file" option to status bar
- Add popup to show current status bar mode
- Add support for codicons
- Fix block comment extraction

## v0.0.171 - 2020-03-29

- Refresh files after a timeout
- Fix tag counts in tags only view
- Add support for hiding tags from the status bar counts
- Fix cycling of status bar

## v0.0.170 - 2020-03-22

- Add option to manually start the scan
- Add configuration for tooltip
- Don't refresh when regex is being changed
- Add more information about globs to README.md
- Allow file watcher glob to be configured
- Fix error on deactivate (thanks to [hacke2](https://github.com/hacke2))

## v0.0.169 - 2020-02-25

- Turn off file watcher by default

## v0.0.168 - 2020-02-25

- Support showing TODOs from current file only
- Show scan mode indication in status bar item
- Add HACK and XXX to default tags
- Add support for using built in search excludes
- Add button icons for README.md
- Allow array settings to be modified in the settings GUI
- Detect external file changes and update tree

## v0.0.167 - 2020-01-30

- Skip leading whitespace when highlighting
- Fix hide tree when empty option
- Count markdown TODOs as "TODO" when showing totals in the status bar
- Use a default colour for ruler highlights
- Add better explanation of useBuiltInExcludes setting
- Add support for compact folders in tree
- Fix path searches

## v0.0.166 - 2020-01-22

- Improve fix for case where $TAGS is not used in regex
- Support tag groups

## v0.0.165 - 2020-01-21

- Fix case where $TAGS is not used in regex

## v0.0.164 - 2020-01-20

- Fix missing background colours

## v0.0.163 - 2020-01-20

- Add some default icons and the BUG tag
- Fix reveal tree from status bar
- Remove files from tree when files are closed
- Add option to show icons in gutter

## v0.0.162 - 2019-11-04

- Add support for manually revealing the current file in the tree

## v0.0.161 - 2019-10-30

- Add support for theme colours in highlights
- Turn on highlighting by default (inverted editor background/foreground)

## v0.0.160 - 2019-10-11

- Fix submodule detection to look for .git file not folder

## v0.0.159 - 2019-10-11

- Add option to ignore git submodules
- Reorder icons to be consistent with the Explorer view
- Fix white icons in tree
- Remove cached icons when resetting cache
- Sort tags in reverse order to allow more specific tags to be found first
- Add link to wiki in README.md

## v0.0.158 - 2019-10-03

- Allow --no-config to be removed
- Simplify regex escape regexes
- Show active folder filters in tree

## v0.0.157 - 2019-10-01

- Further improvements to regex chars in tags

## v0.0.156 - 2019-09-29

- Fix top level folder globs
- Add support for including the built in files.exclude setting

## v0.0.155 - 2019-09-27

- Handle regex characters in tags properly

## v0.0.154 - 2019-09-25

- Add setting to control which editor URI schemes should be highlighted
- Add --no-config to ripgrep command to prevent parsing of user rg.conf files
- Fix object migration bug
- Improve folder globs for windows
- Replace all instances of tags in regex (thanks to [tylerbrockett](https://github.com/tylerbrockett))

## v0.0.153 - 2019-09-12

- Update README.md with new settings (thanks to [abelmatser](https://github.com/abelmatser))
- Fix ripgrep arguments
- Add "Reset Cache" command

## v0.0.152 - 2019-09-12

- Fix migration of 'tags' setting
- Open settings in a better way

## v0.0.151 - 2019-09-11

- Use global state (not workspace state) for "Don't Show This Again"

## v0.0.150 - 2019-09-11

- Make "Open Settings" work for Insiders too

## v0.0.149 - 2019-09-11

- Fix "Ignore" option for settings migration warning

## v0.0.148 - 2019-09-11

- Move settings into groups
- Make settings in README.md easier to read

## v0.0.147 - 2019-09-10

- Fix broken match extraction
- Fix 'os' library import for export function (thanks to [thalesfsp](https://github.com/thalesfsp))
- Fix settings table in README.md

## v0.0.146 - 2019-09-09

- Simplify regex for decoding results and fall back to old method on failure

## v0.0.145 - 2019-09-07

- Allow use of the todo-tree icon in the tree

## v0.0.144 - 2019-09-07

- Improve decoding of ripgrep results (thanks to [Quacky2200](https://github.com/Quacky2200))

## v0.0.143 - 2019-08-27

- Remove use of deprecated rootPath when exporting tree
- Add option to configure border radius on highlights
- Check file path when looking for existing todo nodes

## v0.0.142 - 2019-08-21

- Fix magenta icon
- Handle tags at the end of lines better

## v0.0.141 - 2019-08-13

- Fix custom coloured icons
- Sort folders before files

## v0.0.140 - 2019-08-12

- Update icons to match the 1.37.0 GUI (great work by [johnletey](https://github.com/johnletey) - many thanks!)
- Add option to hide ruler markers
- Add option to reveal tree when clicking the status bar

## v0.0.139 - 2019-07-15

- Add option to hide icons when grouping by tag
- Add support for fontStyle, fontWeight and textDecoration to highlights

## v0.0.138 - 2019-07-01

- Fix multiline highlight

## v0.0.137 - 2019-06-30

- Fix error in isHex function
- Add folder filtering context menu
- Make multiline TODO highlights work properly
- Add option to disable hiding the tree when it is empty

## v0.0.136 - 2019-06-28

- Add option to highlight line to full width of the editor

## v0.0.135 - 2019-06-13

- Add tree export feature

## v0.0.134 - 2019-06-02

- Add license

## v0.0.133 - 2019-06-02

- Add option to prevent globs being passed to ripgrep

## v0.0.132 - 2019-05-14

- Add option to highlight the comment characters in front of the tag
- Add option to highlight the comment characters in front of the tag and text (thanks to [sidpagariya](https://github.com/sidpagariya))
- Improve glob handling (thanks to [somewhatabstract](https://github.com/somewhatabstract))
- Prevent finding TODOs in output windows, etc.
- Fix clearing of filter
- Add missing icons in README.md

## v0.0.131 - 2019-05-10

- Add configuration for reveal behaviour (thanks to [pd93](https://github.com/pd93))
- Fixed install instructions in README.md (thanks to [patros](https://github.com/patros))

## v0.0.130 - 2019-04-25

- Improve experience for contributors (thanks to [true0r](https://github.com/true0r))
- Remove colon in format strings (thanks to [true0r](https://github.com/true0r))
- Fix hideFromTree for complex tags
- Fix detection of multiline highlights in open files

## v0.0.129 - 2019-04-17

- Add "scan open files only"/"scan workspace" toggle button
- Fix previous fix (sigh)

## v0.0.128 - 2019-04-16

- Use old highlight mechanism if no tag is extracted from the match

## v0.0.127 - 2019-04-14

- Support multiline TODOs
- Save filter state

## v0.0.126 - 2019-03-27

- Add option to hide tags from tree, but still highlight in files
- Add link to octicons to README.md

## v0.0.125 - 2019-03-11

- Revert adding word boundary from default regex

## v0.0.124 - 2019-03-07

- Fix ripgrep argument combination (sorry again!)

## v0.0.123 - 2019-03-07

- Fix default regex (sorry!)

## v0.0.122 - 2019-03-06

- Set default ripgrepArgs to include "--max-columns=1000"
- Add word boundary to default regex

## v0.0.121 - 2019-03-04

- Add support for ${filename} in label format
- Remove redundant dependency on minimatch

## v0.0.120 - 2019-02-27

- Fix error when creating resources

## v0.0.119 - 2019-02-19

- Use globalStoragePath instead of storagePath

## v0.0.118 - 2019-02-10

- Fix isNaN error (thanks to [JakubKoralewski](https://github.com/JakubKoralewski))

## v0.0.117 - 2019-02-08

- Add support for overview ruler configuration

## v0.0.116 - 2019-01-28

- Update to the latest octicons

## v0.0.115 - 2019-01-18

- Don't set default background colours unless a background is specified

## v0.0.114 - 2019-01-11

- Fix crash when highlight colour is not defined

## v0.0.113 - 2019-01-10

- Add opacity option to highlights
- Removed settings migration code

## v0.0.112 - 2019-01-01

- Fix line number in label format
- Add black and white colours

## v0.0.111 - 2018-12-21

- Add support for showing counts in the tree
- Add top three counts option to status bar
- Add configuration of TODO item labels
- Remove deprecated settings
- Fix root folder configuration

## v0.0.110 - 2018-12-17

- Fix bug in tag counting

## v0.0.109 - 2018-12-11

- Add support for showing counts of tags in the status bar
- Fix showTagsFromOpenFilesOnly

## v0.0.108 - 2018-12-09

- Add option to sort tags only view alphabetically

## v0.0.107 - 2018-11-28

- Add line number to tooltip
- Add new minimal view (tags only)
- Fix context.storagePath creation error
- Start adding unit tests
- Fix tag extraction function (properly)

## v0.0.106 - 2018-11-22

- Fix tag extraction function

## v0.0.105 - 2018-11-21

- Don't add entries for open files if already found by search
- Don't remove items from tree when file is closed and showTagsFromOpenFilesOnly is false

## v0.0.104 - 2018-11-21

- Don't use case sensitive group nodes if regexCaseSensitive if false
- Remove items from tree when file is closed and showTagsFromOpenFilesOnly is true

## v0.0.103 - 2018-11-19

- Fix globs migration error

## v0.0.102 - 2018-11-17

- Make globs work properly (at last!)
- Fix showTagsFromOpenFilesOnly option
- Expand ${workspaceFolder} in rootFolder for all workspaces

## v0.0.101 - 2018-11-06

- Provide configuration for included/excluded workspace folders

## v0.0.100 - 2018-11-05

- Handle situation where there are no workspace folders better

## v0.0.99 - 2018-11-04

- Trap errors when there are no workspaces

## v0.0.98 - 2018-11-02

- Allow debug channel to be enabled/disabled without reloading the window

## v0.0.97 - 2018-10-30

- Fix trailing slash on windows paths
- Remove leading newlines from matches in files
- Show `line <n>` for tags with no content when grouping by tag

## v0.0.96 - 2018-10-23

- Don't sort tags within files

## v0.0.95 - 2018-10-22

- Fix workspace paths
- Replace backslashes in the tags list with \\x5c

## v0.0.94 - 2018-10-22

- Set workspaces when first TODO is added

## v0.0.93 - 2018-10-21

- Major refactor to simplify and remove unused code
- Stop using ripgrep for single file updates
- Add configuration setting for badges and SCM state
- Fix configuration example and rust regex link ([#82](https://github.com/Gruntfuggly/todo-tree/issues/82) and [#79](https://github.com/Gruntfuggly/todo-tree/issues/79))
- Support multiple workspaces properly
- Preserve expansion state when changing view and reloading the window

## v0.0.92 - 2018-10-02

- Add support for case insensitive tag matching

## v0.0.91 - 2018-10-02

- Sort tree alphabetically when grouping by tag

## v0.0.90 - 2018-09-28

- Allow proper highlighting without using tags setting
- Reveal items in the middle of the window ([#76](https://github.com/Gruntfuggly/todo-tree/issues/76)

## v0.0.89 - 2018-09-26

- Fix stupid label trimming error

## v0.0.88 - 2018-09-22

- Allow customHighlight match by regex

## v0.0.87 - 2018-09-22

- Support multiple tags on the same line

## v0.0.86 - 2018-09-10

- Allow the icon colour to be explicit set in the custom and default highlight settings.

## v0.0.85 - 2018-09-07

- Restore 'expanded', 'flat' and 'grouped' default configuration settings  (fixes [#68](https://github.com/Gruntfuggly/todo-tree/issues/68))

## v0.0.84 - 2018-09-06

- Fix tree elements not appearing when there is no workspace (fixes [#67](https://github.com/Gruntfuggly/todo-tree/issues/67))
- Use workspaceState for view state instead of workspace settings
- Remove redundant settings from README.md
- Fix a bunch of typos in various files

## v0.0.83 - 2018-09-04

- If foreground is not specified, use black or white depending on background colour
- If foreground is not specified, use background for icon colour if specified, else deprecated colours

## v0.0.82 - 2018-09-02

- Fix settings for unknown tags (e.g. markdown TODOs)

## v0.0.81 - 2018-09-02

- Fix spelling mistake in package.json

## v0.0.80 - 2018-09-02

- Extend configurability of highlights

## v0.0.79 - 2018-08-22

- Add support for highlight tag only, tag and text, or entire line
- Inhibit tracking document when selecting from tree

## v0.0.78 - 2018-08-06

- Prevent tracking file when grouping enabled

## v0.0.77 - 2018-08-03

- Track open file in the tree views

## v0.0.76 - 2018-07-31

- Add information about header buttons to README.md

## v0.0.75 - 2018-07-31

- Add commands for adding and removing tags
- Add note to README.md about reloading the window after installation
- Add note to README.md about excluding files and folders

## v0.0.74 - 2018-07-31

- Fix showing highlights properly

## v0.0.73 - 2018-07-30

- Show highlights in all editors (not just the active editor) (fixes [#61](https://github.com/Gruntfuggly/todo-tree/issues/61))

## v0.0.72 - 2018-07-16

- Treat process as a stream to avoid buffer size problems

## v0.0.71 - 2018-07-13

- Inhibit failure messages when there is nothing found

## v0.0.70 - 2018-07-13

- Allow configuration of buffer size to cope with large amounts of TODOs (thanks to [somewhatabstract](https://github.com/somewhatabstract))

## v0.0.69 - 2018-07-12

- Support custom icons from the octicon set

## v0.0.68 - 2018-07-12

- Fix trailing slash in rootFolder (Windows)

## v0.0.67 - 2018-07-12

- Add support for interrupt/restart of scan

## v0.0.66 - 2018-07-06

- Allow delay before highlighting to be configured

## v0.0.65 - 2018-07-02

- Fix icons for folders
- Add start of line as start of tag marker

## v0.0.64 - 2018-06-29

- Add support for grouping by tags

## v0.0.63 - 2018-06-14

- Cope with languages that don't have block comments

## v0.0.62 - 2018-06-14

- Handle missing languages when checking block comments

## v0.0.61 - 2018-06-14

- Tidy up trailing block comments
- Fix error when checking for changed editors (thanks to [md2perpe](https://github.com/md2perpe))

## v0.0.60 - 2018-06-11

- Improve tag matching icon colours

## v0.0.59 - 2018-06-10

- Add option to disable scanning of workspace

## v0.0.58 - 2018-06-05

- Add in file highlighting
- Remove leading comments from tree

## v0.0.57 - 2018-05-28

- Apply globs to files out of workspace

## v0.0.56 - 2018-05-28

- Add configuration to disable auto refresh

## v0.0.55 - 2018-05-25

- Add filter function
- Refresh or rebuild (as appropriate) the tree on config changes

## v0.0.54 - 2018-05-23

- Add expand/collapse buttons
- Fix link to rust regex docs
- Change example glob pattern in config

## v0.0.53 - 2018-05-17

- Restore icons to the explorer tree view

## v0.0.52 - 2018-05-12

- Inhibit warning if version of vscode is earlier than 1.23

## v0.0.51 - 2018-05-11

- Add tree view to activity bar

## v0.0.50 - 2018-05-09

- Fix bad display of README.md in marketplace

## v0.0.34 - 2018-05-09

- Add support for additional ripgrep arguments
- Add support for diagnostic logging (to Output window)
- Improve configuration section of README.md

## v0.0.33 - 2018-04-27

- Allow variable substitution (including ${workspaceFolder}) in todo-tree.rootFolder

## v0.0.32 - 2018-04-25

- Show TODOs from open files which are not within the workspace. Note: Due to a limitation of VSCode, they will only appear as the files are loaded.
- Split tags out of regex to simplify configuration. Note: existing configurations should still work.
- Removed autoUpdate flag as it seems a but irrelevant now
- Improve stability of tree

## v0.0.31 - 2018-03-19

- Fix executable name for Windows

## v0.0.30 - 2018-03-17

- Inhibit error when no root folder is initially available

## v0.0.29 - 2018-03-16

- Add support for multiple workspaces
- Refresh view when configuration is modified

## v0.0.28 - 2018-03-15

- Fix sort function

## v0.0.27 - 2018-03-14

- Locate ripgrep dynamically (thanks to [ericmoritz](https://github.com/ericmoritz))

## v0.0.26 - 2018-03-08

- Try resetting the ripgrep path if the current path is not found

## v0.0.25 - 2018-03-08

- Support new location of vscode-ripgrep for 1.21.0

## v0.0.24 - 2018-03-06

- Inhibit error messages from ripgrep (stops error when current folder is empty)
- Refresh current file when editor is closed

## v0.0.23 - 2018-02-22

- Allow hex codes to be used to specify icon colours

## v0.0.22 - 2018-02-21

- Add keywords to package.json
- Update description

## v0.0.21 - 2018-02-20

- Added list of available icon colours to configuration description

## v0.0.20 - 2018-02-19

- Added a screenshot to the README.md

## v0.0.19 - 2018-02-19

- Allow icon colour customization based on type of tag

## v0.0.18 - 2018-02-16

- Fixed default regex for HTML (thanks to [kcmr](https://github.com/kcmr))

## v0.0.17 - 2018-02-16

- Add support for file icons from theme
- Add customizable icon colour for todo icon

## v0.0.16 - 2018-02-16

- Fix single file update in flat view

## v0.0.15 - 2018-02-02

- Fix globs in Windows

## v0.0.14 - 2018-01-17

- If vscode-ripgrep is not found in the standard location, try finding it using the application installation path.

## v0.0.13 - 2018-01-16

- Hide the viewlet by default - instead of when detecting there is nothing in the tree.
- Use the version of vscode-ripgrep and comes with vscode itself. This is a lot simpler and makes startup quicker too. The downside is that if vscode is installed somewhere other than the default location, it won't be found.

## v0.0.12 - 2018-01-05

- Force the use of an older version of vscode-ripgrep. The latest version seems to fail to install.

## v0.0.11 - 2017-12-16

- Remove command logging

## v0.0.10 - 2017-12-16

- Add flat list view

## v0.0.9 - 2017-12-13

- Only show the tree view if it's not empty

## v0.0.8 - 2017-12-12

- Fix scanning message
- sort results to keep tree consistent
- remove empty parent nodes from the tree
- ignore files outside the root folder
- handle filenames containing spaces

## v0.0.7 - 2017-11-30

- Add auto update when saving files
- Add preference to show tree expanded by default

## v0.0.6 - 2017-11-28

- Only attempt install if todo-tree.ripgrep is not defined and show some info if the install fails

## v0.0.5 - 2017-11-28

- Attempt to install vscode-ripgrep directly from the extension

## v0.0.4 - 2017-11-28

- Attempt to reinstall vscode-ripgrep automatically

## v0.0.3 - 2017-11-28

- Removed redundant dependencies
- Add some info for fixing the windows version of vscode-ripgrep

## v0.0.2 - 2017-11-27

- Made it work on Windows
- Add configuration for ripgrep executable path
- Improved error handling

## v0.0.1 - 2017-11-23

- Initial release
