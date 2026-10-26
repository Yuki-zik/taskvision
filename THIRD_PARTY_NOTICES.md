# Third-party notices

TaskVision retains the inherited Todo Tree MIT notice (Nigel Scott) in LICENSE and licenses/TodoTree-LICENSE.txt. Source: https://github.com/Gruntfuggly/todo-tree.

The workbench uses unmodified open-source packages. License texts shipped in `licenses/` accompany their distributions. No paid React Flow Pro example has been copied. React Flow attribution remains visible.

| Component | Purpose | License / source |
|---|---|---|
| @xyflow/react, @xyflow/system | Interactive graph | MIT, https://github.com/xyflow/xyflow |
| React Flow UI BaseNode / NodeTooltip | Vendored official node UI source; registry hashes and local changes in third_party/react-flow-ui | MIT, https://reactflow.dev/ui (official page links to xyflow/xyflow LICENSE) |
| clsx / tailwind-merge | Upstream-compatible class composition | MIT, license files in licenses/ |
| @tisoap/react-flow-smart-edge v5 | Obstacle-avoiding A* routes and React Flow Web Worker path computation | MIT, https://github.com/tisoap/react-flow-smart-edge |
| elkjs 0.12.0 | Automatic orthogonal graph layout | EPL-2.0 OR GPL-3.0-or-later; distributed under EPL-2.0, unmodified, source https://github.com/kieler/elkjs/tree/v0.12.0 |
| React / React DOM | Workbench rendering | MIT, https://github.com/facebook/react |
| Lucide React | Interface icons | ISC, https://github.com/lucide-icons/lucide |
| TypeScript parser 5.9.3 | Pure-JavaScript syntax analysis | Apache-2.0, https://github.com/microsoft/TypeScript/tree/v5.9.3 |
| MCP TypeScript SDK | Agent protocol | MIT, https://github.com/modelcontextprotocol/typescript-sdk |
| Zod | Boundary validation | MIT, https://github.com/colinhacks/zod |

TypeScript 7 is a development-time compiler only. Runtime syntax parsing uses the pinned pure-JavaScript package alias `typescript-parser`, so a packaged extension does not require the compiler native binary.

Existing extension dependencies retain their bundled license comments. This notice describes shipped components and does not change their licenses.

React Flow UI sources are copied using the official registry/manual installation route. Original registry JSON and SHA-256 hashes are retained. Local changes are documented; no paid templates or Pro examples are copied. Tailwind4 is build-time only, with no Preflight reset and source scanning limited to the node kit.

`@floating-ui/dom` (MIT) supplies viewport-aware flip/shift/size and transform tracking for node details/actions. This documented local patch prevents the official UI's fixed-side toolbar from clipping near canvas boundaries. Matching dependency license texts are shipped in licenses/.
