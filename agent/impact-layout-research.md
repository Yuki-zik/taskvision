# TaskVision layout feasibility evidence · 2026-10-26

Decision: **GO for the deterministic offline D2 exporter and measured existing ELK baseline. DEFER TALA A/B; NO-GO for a production layout-engine change on this evidence.** The tool is implemented in `scripts/compare-architecture-layouts.mjs`. It changes no GraphView, legacy extension, MCP, runtime dependency, package manifest or generated bundle.

## Scope and execution state

This worker owns only the script, this report, and the assigned workbench. Main owns task/timeline updates and production integration. The user-owned `.taskvision/ai-status-report.md` was neither read nor edited/staged.

Implemented:

- Canonical IDs/order, escaped labels, real arrow direction, requested production node sizes and existing relation counts in D2.
- Actual `buildGraph` / `layoutGraph` imports through installed `tsx/esm/api`; three identical-input ELK runs, geometry equality assertion, measured crossings/overlaps/intrusions/bends/length/area, placements and original polyline routes in JSON.
- An SVG of those measured ELK rectangles/routes, with the same node and relation-count labels exported to D2. This is a static diagnostic renderer of actual geometry, not a screenshot of React Flow.
- Default built-core route: copy scanner-admitted source text into a disposable workbench mirror; invoke `workspace/core/index.mjs createWorkspace().dispatch('snapshot')`; assert its graph evidence equals the current source scanner. Git discovery is bounded inside the mirror so neither this checkout's SQLite nor another repository's SQLite is written. Mirror and its SQLite are removed in `finally`.
- Optional explicit `--d2 /absolute/path/to/d2` verifies reported version 0.9.0 and attempts a bounded 12-second TALA SVG render. It never auto-downloads/installs. Even a successful render is marked `rendered-unmeasured` with geometry metrics null until an actual D2 geometry adapter is verified.

**This worker could execute only the zero-write source-scanner route.** The managed sandbox rejected `mkdir '/Users/a-znk/agent-machine/workbench/taskvision-impact-tala-20261026/comparison'` with `EPERM`. Therefore no D2, SVG or comparison JSON file was persisted to that workbench, and the default isolated built-core route was not executed here. The built-core file was read/fingerprinted, not used as the measured scanner. This limitation must remain visible in any handoff; do not relabel the measurements below as a built-core benchmark.

The zero-write run emitted the complete JSON, deterministic D2 text and actual ELK SVG in stdout. The exact D2 text is retained below so the useful export survives this environment limitation.

## Measured current project

Command actually executed successfully:

```bash
node scripts/compare-architecture-layouts.mjs --read-only-source --stdout
```

Environment: darwin arm64, Node v22.22.0, package version 3.1.0; branch `feat/graph-impact-tala-20261026`, HEAD `7cc212fad8803db22b12bc5883add6188fa0ec79`. The working tree is changing concurrently as main integrates the impact lens.

Snapshot: 160 source files, 2000-file budget, no truncation/incomplete reads/skipped files. Scope is root code overview, collapsed modules, all relation categories, summary mode, no search/tag/hotspot/focus filter. Persisted knowledge/tasks/reviews are deliberately absent; relationships come from existing static source evidence.

The first exploration saw 10 module edges. The measured run saw **11** after concurrent real tests added a resolved import to core. The exporter preserves that input change rather than forcing an older expected edge count. There are 35 observed source references represented by these 11 aggregated module edges.

| Metric                                                 | Actual ELK result         | TALA                              |
| ------------------------------------------------------ | ------------------------- | --------------------------------- |
| Nodes / directed aggregate edges                       | 8 / 11                    | Not executed                      |
| Requested node size                                    | 236 × 154                 | Same sizes exported, not rendered |
| Positive-area node overlap pairs                       | 0                         | null                              |
| Edge / unrelated-node interior intrusion pairs         | 0                         | null                              |
| Proper interior crossing points, per edge pair         | 1                         | null                              |
| Edge pairs sharing a positive-length collinear segment | 24                        | null                              |
| Direction changes / bends                              | 22                        | null                              |
| Total polyline length                                  | 3254 graph units          | null                              |
| Node + route bounding box                              | x=24, y=24, 836 × 694     | null                              |
| Bounding area                                          | 580184 square graph units | null                              |
| Label overlaps                                         | Unmeasured, null          | null                              |
| First layout call                                      | 151.713 ms                | Not executed                      |
| Next two layout calls                                  | 15.742 / 11.708 ms        | Not executed                      |
| Exact geometry equality across three calls             | Passed                    | Not executed                      |

Runtime samples are individual observations on this machine under concurrent work, not a distribution or hardware promise. First call includes dynamic ELK import, engine creation and layout; source imports/scanning/export/SVG rendering are outside that timer. Warm calls reuse the engine.

| Node                   |   x |   y | width × height |
| ---------------------- | --: | --: | -------------- |
| module:@tests          |  24 |  24 | 236 × 154      |
| module:apps/cli        |  24 | 204 | 236 × 154      |
| module:apps/mcp        |  24 | 384 | 236 × 154      |
| module:apps/server     |  24 | 564 | 236 × 154      |
| module:apps/web        | 324 |  24 | 236 × 154      |
| module:packages/core   | 324 | 302 | 236 × 154      |
| module:packages/shared | 624 | 302 | 236 × 154      |
| module:src             | 624 | 482 | 236 × 154      |

| Actual import/dependency direction | Existing categorized reference counts |
| ---------------------------------- | ------------------------------------- |
| @tests → apps/web                  | runtime × 11, type × 2                |
| @tests → packages/core             | runtime × 1                           |
| apps/cli → packages/core           | runtime × 1                           |
| apps/cli → packages/shared         | runtime × 1                           |
| apps/mcp → packages/core           | runtime × 1                           |
| apps/mcp → packages/shared         | runtime × 1, type × 1                 |
| apps/server → packages/core        | runtime × 1                           |
| apps/server → packages/shared      | runtime × 1, type × 1                 |
| apps/web → packages/shared         | reexport × 1, type × 1                |
| packages/core → packages/shared    | runtime × 1, type × 9                 |
| packages/core → src                | runtime × 1                           |

Provenance:

- Graph evidence SHA-256: `6cf5439c8ea3b43f90d95fa550946ac2e1699c529e1cd1bdbd2643d8eceb23e5`.
- D2 text SHA-256: `d32ae5443a8ecbc18258f5c39491f7719ee78a817ff10f29fb0ecad8228f33d3`.
- Built-core bytes observed during this source-only measurement: `750188f636fb131df6770dbda23b15651fded726fb413385a685a2b2f22ce270` (not evidence of execution).
- Scanned file-hash map SHA-256 at measurement: `96ca3c92a651619efe7029e1f04909553539c32ab4da666141c5b503cf84465f`. Adding this report or subsequent main edits changes the full-source digest; the graph/D2 hashes change only when their exported evidence changes.
- In-memory SVG was generated successfully; it was not saved, browser-rendered or visually reviewed in this sandbox. No screenshot/readable-text acceptance is claimed.

## Public D2/TALA availability and bounded access evidence

The official [D2 v0.9.0 release](https://github.com/d2lang/d2/releases/tag/v0.9.0) states that TALA is bundled in CLI and JS/WASM without a separate plugin or license key. The [public assets listing](https://github.com/d2lang/d2/releases/expanded_assets/v0.9.0) exposes a 16.3 MB Mac arm64 tarball:

- [d2-v0.9.0-macos-arm64.tar.gz](https://github.com/d2lang/d2/releases/download/v0.9.0/d2-v0.9.0-macos-arm64.tar.gz)
- Published asset SHA-256: `eaf6c0c143e56dd9fa97bfb6df25ea9c1ebce40245f056a0768cf1a6c15d3064`.

This is public release metadata, not proof that this worker downloaded or verified those bytes. Official pages were readable through the web research tool without login, but terminal accesses failed immediately with `curl: (6) Could not resolve host`:

1. `api.github.com/repos/d2lang/d2/releases/tags/v0.9.0`.
2. HEAD request to the exact GitHub arm64 tarball URL.
3. Compatibility-package registry metadata at `registry.npmjs.org/@terrastruct/d2`.
4. Official replacement package tarball at `registry.npmjs.org/@d2lang/d2/-/d2-0.1.34.tgz`.

Every curl used `--connect-timeout 4 --max-time 12 --retry 0`; no host family was attempted more than twice. No source build, global brew/npm installation, account/login flow or repeated access loop was attempted.

The official [v0.9.0 JS package metadata](https://github.com/d2lang/d2/blob/v0.9.0/d2js/js/package.json) identifies `@d2lang/d2` version 0.1.34, MPL-2.0, with Node/browser ESM entry points. Its [README](https://github.com/d2lang/d2/blob/v0.9.0/d2js/js/README.md) documents `compile(source, { layout: 'tala' })`, render/dispose and the older namespace as a compatibility package. This corrects the earlier review's focus on the old 0.1.33 package. The official [license at the pinned release](https://github.com/d2lang/d2/blob/v0.9.0/LICENSE.txt) is MPL-2.0; the [TALA announcement](https://www.d2lang.com/blog/tala-is-open-source/) confirms the same license. No D2/TALA code or binary was copied into TaskVision.

**Exact TALA blocker:** neither CLI nor WASM bytes could be obtained by the executable environment because external DNS is unavailable. Separately, artifact persistence is denied by the managed workbench write boundary. TALA version execution, SVG appearance, layout runtime, overlap/crossing/bend counts and superiority remain unmeasured.

## Measurement contract and apples-to-apples limits

- Arrows always remain A → B = A imports/depends on B. This does not establish runtime execution, data flow or that changing B breaks A.
- Rectangles overlap only with positive intersection area; mere boundary contact does not count. Unrelated-node intrusion clips each real route segment to node interiors and excludes that edge's source/target.
- Proper crossings count strict segment-interior intersections, deduplicated by coordinate within each edge pair. Segment endpoint contacts, T-junctions and collinear shared runs are excluded. Shared runs are reported separately; 24 pairs is **not** 24 distinct physical wires or a zero-crossing claim.
- Bends count noncollinear direction changes or reversals after removing duplicate adjacent points. Length is Euclidean polyline length. These are outputs from production `layoutGraph` on the canonically ordered matched graph, before Smart Edge's live obstacle routing/smoothing. Canonical edge order can differ from the live UI and ELK considers model order; these are not current browser-route scores.
- D2 receives the same IDs, node labels, relation-count labels, directed edges and requested sizes. D2's text measurement, edge-label constraints, whitespace, ports and renderer differ. Production ELK does not reserve edge-label boxes. The diagnostic SVG places labels at polyline midpoints without claiming they do not overlap.
- D2 SVG viewBox/scaling, outer/nested translations, padding, clipping and hashed DOM identifiers require verified mapping back to exported IDs. Reading a rect's x/y or a path's d alone is insufficient. The [official JS types](https://github.com/d2lang/d2/blob/v0.9.0/d2js/js/index.d.ts) expose structured shape positions and connection routes, a better adapter candidate once real output can be tested. No unexecuted adapter is represented as measured.
- CLI wall time includes startup, parse, text measurement, layout and rendering; it cannot be compared directly with this in-process ELK layout timer. A meaningful engine comparison needs matched geometry and separately scoped compile/layout/render timings.
- Official TALA documentation warns that adding nodes can substantially change layout and that larger diagrams can take longer. That makes a one-shot static export a reasonable optional helper candidate, but supplies no evidence for replacing TaskVision's remembered interactive positions.

## Runnable delivery and validation

Default artifact-producing command, implemented but blocked here at workbench mkdir:

```bash
node scripts/compare-architecture-layouts.mjs
```

Intended outputs, all under the owned workbench:
`~/agent-machine/workbench/taskvision-impact-tala-20261026/comparison/{architecture.d2,elk.svg,comparison.json}`.
The default route writes no project database and cleans its disposable source mirror. Custom `--out` must stay below the assigned workbench. Existing symlink destinations are rejected.

If an official, checksum-verified CLI is supplied later, the same command accepts `--d2 /absolute/path/to/d2`; it attempts `tala.svg` on that exact D2 export and reports success/failure without fabricating geometry. This optional CLI path remains unexecuted here.

Checks actually run:

- `node scripts/compare-architecture-layouts.mjs --self-test`: 6/6 passed. Cases were written first and initially failed before implementation; cover deterministic/escaped directional export, real crossing/bends/length, touching versus overlap, collinear overlap, unrelated-node intrusion, missing/invalid geometry.
- `node --check scripts/compare-architecture-layouts.mjs`: passed.
- `node scripts/compare-architecture-layouts.mjs --help`: passed.
- `node scripts/compare-architecture-layouts.mjs --read-only-source --stdout`: passed, actual measurements above; complete JSON and SVG/D2 strings emitted.
- Default invocation: failed with the specific EPERM above, not counted as successful built-core/artifact acceptance.
- Script formatted with the existing local Prettier executable. Production/web/legacy suite ownership remains with main; this worker makes no claim to those concurrent results.

## Exact deterministic D2 source from the measured graph

```d2
# A -> B means observed source imports/dependencies; never runtime data flow.
direction: right
n0000: "测试" {
  shape: rectangle
  width: 236
  height: 154
}
n0001: "apps/cli" {
  shape: rectangle
  width: 236
  height: 154
}
n0002: "apps/mcp" {
  shape: rectangle
  width: 236
  height: 154
}
n0003: "apps/server" {
  shape: rectangle
  width: 236
  height: 154
}
n0004: "apps/web" {
  shape: rectangle
  width: 236
  height: 154
}
n0005: "packages/core" {
  shape: rectangle
  width: 236
  height: 154
}
n0006: "packages/shared" {
  shape: rectangle
  width: 236
  height: 154
}
n0007: "src" {
  shape: rectangle
  width: 236
  height: 154
}
n0000 -> n0004: "runtime × 11, type × 2"
n0000 -> n0005: "runtime × 1"
n0001 -> n0005: "runtime × 1"
n0001 -> n0006: "runtime × 1"
n0002 -> n0005: "runtime × 1"
n0002 -> n0006: "runtime × 1, type × 1"
n0003 -> n0005: "runtime × 1"
n0003 -> n0006: "runtime × 1, type × 1"
n0004 -> n0006: "reexport × 1, type × 1"
n0005 -> n0006: "runtime × 1, type × 9"
n0005 -> n0007: "runtime × 1"
```

## 主线程集成验收补充（以最新结果为准）

工作线程因沙盒写入限制，原报告上文如实记录了“只读源码扫描”和无法保存文件的阶段性状态。随后协调线程在 Mac mini **实际运行**了默认命令：

```sh
node scripts/compare-architecture-layouts.mjs
```

运行成功，**使用隔离的 built-core `createWorkspace().dispatch('snapshot')` 路径**。结果生成在本地工作台：

- `comparison/architecture.d2`（真实模块、方向、类型统计，可复现 D2 输入）
- `comparison/elk.svg`（ELK 原始几何的静态诊断视图，并非 TALA 视图）
- `comparison/comparison.json`（环境、源码指纹、节点/边、真实 ELK 位置与路径、指标及 TALA 未执行状态）

该次快照索引了 **161 个源文件**（未截断，skippedFiles=0），得到 **8 个架构模块 / 11 条聚合有向关系**。ELK 几何：0 对节点重叠、0 条边穿过其他节点内部、1 个严格交叉、22 次折弯、总路径长度 3254 图坐标单位、包围面积 580184 平方图单位。TALA 字段保持 `status: deferred`、`metrics: null`，没有将 ELK 结果当成 D2/TALA 的效果。

此验收发生在原工作线程的 `--read-only-source --stdout` 测量之后，新增测试文件改变了全量源码数量，因此不要把两次测量的全源码哈希当作相同版本。两次模块/关系结论一致，新增导出物归属于这一轮真正执行的默认路径。外部官网下载 D2 CLI 的尝试未成功；无法确认 TALA 的图像或性能，也不以此建议替换生产布局。
