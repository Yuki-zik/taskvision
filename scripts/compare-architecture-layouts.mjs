import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { tsImport } from 'tsx/esm/api';

const repository = fileURLToPath(new URL('../', import.meta.url));
const workbench = path.join(
  os.homedir(),
  'agent-machine/workbench/taskvision-impact-tala-20261026',
);
const EPS = 1e-7;
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const round = (value) => Math.round(value * 1000) / 1000;
const segments = (points) => points.slice(1).map((point, i) => [points[i], point]);
const cross = (a, b) => a.x * b.y - a.y * b.x;
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });

function canonical(model) {
  return {
    ...model,
    nodes: [...model.nodes].sort((a, b) => compare(a.id, b.id)),
    edges: [...model.edges].sort((a, b) => compare(a.id, b.id)),
  };
}

function edgeLabel(item) {
  return Object.entries(item.data.kindCounts)
    .sort(([a], [b]) => compare(a, b))
    .map(([kind, count]) => `${kind} × ${count}`)
    .join(', ');
}

function exportD2(input) {
  const model = canonical(input);
  const ids = new Map(model.nodes.map((item, i) => [item.id, `n${String(i).padStart(4, '0')}`]));
  const lines = [
    '# A -> B means observed source imports/dependencies; never runtime data flow.',
    'direction: right',
  ];
  for (const item of model.nodes) {
    lines.push(
      `${ids.get(item.id)}: ${JSON.stringify(item.data.label)} {`,
      '  shape: rectangle',
      `  width: ${item.width}`,
      `  height: ${item.height}`,
      '}',
    );
  }
  for (const item of model.edges) {
    assert.ok(ids.has(item.source) && ids.has(item.target), 'Unknown edge endpoint');
    lines.push(
      `${ids.get(item.source)} -> ${ids.get(item.target)}: ${JSON.stringify(edgeLabel(item))}`,
    );
  }
  return lines.join('\n') + '\n';
}

// Proper interior intersections only: endpoint contacts/T-junctions are excluded.
function properIntersection(a, b, c, d) {
  const r = subtract(b, a),
    s = subtract(d, c),
    denominator = cross(r, s);
  if (Math.abs(denominator) < EPS) return null;
  const delta = subtract(c, a),
    t = cross(delta, s) / denominator,
    u = cross(delta, r) / denominator;
  return t > EPS && t < 1 - EPS && u > EPS && u < 1 - EPS
    ? { x: a.x + t * r.x, y: a.y + t * r.y }
    : null;
}

function collinearOverlap(a, b, c, d) {
  const direction = subtract(b, a);
  if (Math.hypot(direction.x, direction.y) < EPS || Math.hypot(d.x - c.x, d.y - c.y) < EPS)
    return false;
  if (
    Math.abs(cross(direction, subtract(c, a))) > EPS ||
    Math.abs(cross(direction, subtract(d, a))) > EPS
  )
    return false;
  const axis = Math.abs(direction.x) > Math.abs(direction.y) ? 'x' : 'y';
  return (
    Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis])) -
      Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis])) >
    EPS
  );
}

// Clip segment to a slightly inset rectangle: boundary tangencies are not intrusions.
function intrudes(a, b, rect) {
  let low = 0,
    high = 1;
  for (const [axis, size] of [
    ['x', 'width'],
    ['y', 'height'],
  ]) {
    const min = rect.position[axis] + EPS,
      max = rect.position[axis] + rect[size] - EPS;
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < EPS) {
      if (a[axis] < min || a[axis] > max) return false;
    } else {
      const t1 = (min - a[axis]) / delta,
        t2 = (max - a[axis]) / delta;
      low = Math.max(low, Math.min(t1, t2));
      high = Math.min(high, Math.max(t1, t2));
      if (low >= high) return false;
    }
  }
  return low < high;
}

function measure(input) {
  const model = canonical(input),
    nodeOverlapPairs = [],
    edgeNodeIntrusions = [],
    collinearEdgeOverlapPairs = [];
  assert.ok(model.nodes.length, 'Empty graph');
  for (const item of model.nodes) {
    assert.ok([item.position.x, item.position.y, item.width, item.height].every(Number.isFinite));
    assert.ok(item.width > 0 && item.height > 0);
  }
  for (const item of model.edges) {
    assert.ok(item.data.points?.length >= 2, `Missing route: ${item.id}`);
    assert.ok(
      item.data.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
    );
  }
  for (let i = 0; i < model.nodes.length; i++) {
    const a = model.nodes[i];
    for (const b of model.nodes.slice(i + 1)) {
      if (
        Math.min(a.position.x + a.width, b.position.x + b.width) -
          Math.max(a.position.x, b.position.x) >
          EPS &&
        Math.min(a.position.y + a.height, b.position.y + b.height) -
          Math.max(a.position.y, b.position.y) >
          EPS
      )
        nodeOverlapPairs.push([a.id, b.id]);
    }
  }
  let bends = 0,
    totalEdgeLength = 0,
    properCrossings = 0;
  for (let i = 0; i < model.edges.length; i++) {
    const a = model.edges[i],
      points = a.data.points;
    for (const [start, end] of segments(points))
      totalEdgeLength += Math.hypot(end.x - start.x, end.y - start.y);
    const distinct = points.filter(
      (point, j) => !j || Math.hypot(point.x - points[j - 1].x, point.y - points[j - 1].y) > EPS,
    );
    for (let j = 1; j < distinct.length - 1; j++) {
      const before = subtract(distinct[j], distinct[j - 1]),
        after = subtract(distinct[j + 1], distinct[j]);
      if (Math.abs(cross(before, after)) > EPS || before.x * after.x + before.y * after.y < 0)
        bends++;
    }
    for (const item of model.nodes) {
      if (
        item.id !== a.source &&
        item.id !== a.target &&
        segments(points).some(([start, end]) => intrudes(start, end, item))
      )
        edgeNodeIntrusions.push([a.id, item.id]);
    }
    for (const b of model.edges.slice(i + 1)) {
      const crossings = new Set();
      let overlaps = false;
      for (const [p, q] of segments(points))
        for (const [r, s] of segments(b.data.points)) {
          const intersection = properIntersection(p, q, r, s);
          if (intersection) crossings.add(`${round(intersection.x)},${round(intersection.y)}`);
          if (collinearOverlap(p, q, r, s)) overlaps = true;
        }
      properCrossings += crossings.size;
      if (overlaps) collinearEdgeOverlapPairs.push([a.id, b.id]);
    }
  }
  const all = [
    ...model.nodes.flatMap((item) => [
      item.position,
      { x: item.position.x + item.width, y: item.position.y + item.height },
    ]),
    ...model.edges.flatMap((item) => item.data.points),
  ];
  const bounds = {
    x: Math.min(...all.map((p) => p.x)),
    y: Math.min(...all.map((p) => p.y)),
    width: Math.max(...all.map((p) => p.x)) - Math.min(...all.map((p) => p.x)),
    height: Math.max(...all.map((p) => p.y)) - Math.min(...all.map((p) => p.y)),
  };
  return {
    nodes: model.nodes.length,
    edges: model.edges.length,
    properCrossings,
    nodeOverlapPairs,
    edgeNodeIntrusions,
    collinearEdgeOverlapPairs,
    bends,
    totalEdgeLength: round(totalEdgeLength),
    bounds,
    area: round(bounds.width * bounds.height),
    labelOverlaps: null,
  };
}

const xml = (value) =>
  String(value).replace(
    /[<>&"']/g,
    (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char],
  );
function routeMidpoint(points) {
  const parts = segments(points);
  let remaining = parts.reduce((sum, [a, b]) => sum + Math.hypot(b.x - a.x, b.y - a.y), 0) / 2;
  for (const [a, b] of parts) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > EPS && remaining <= length)
      return {
        x: a.x + ((b.x - a.x) * remaining) / length,
        y: a.y + ((b.y - a.y) * remaining) / length,
      };
    remaining -= length;
  }
  return points[0];
}
function renderELK(model, metrics) {
  const { x, y, width, height } = metrics.bounds;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x - 24} ${y - 24} ${width + 48} ${height + 48}"><title>Actual TaskVision ELK layout; source import direction</title><defs><marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#475569"/></marker></defs><rect x="${x - 24}" y="${y - 24}" width="${width + 48}" height="${height + 48}" fill="#f8fafc"/>${model.edges.map((item) => `<polyline data-edge-id="${xml(item.id)}" points="${item.data.points.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#475569" stroke-width="1.5" marker-end="url(#arrow)"><title>${xml(`${item.source} → ${item.target}: ${edgeLabel(item)}`)}</title></polyline>`).join('')}${model.nodes.map((item) => `<g data-node-id="${xml(item.id)}"><rect x="${item.position.x}" y="${item.position.y}" width="${item.width}" height="${item.height}" rx="6" fill="white" stroke="#334155"/><text x="${item.position.x + 12}" y="${item.position.y + 32}" font-family="sans-serif" font-size="16">${xml(item.data.label)}</text></g>`).join('')}${model.edges
    .map((item) => {
      const mid = routeMidpoint(item.data.points);
      return `<text x="${mid.x}" y="${mid.y - 5}" text-anchor="middle" font-family="sans-serif" font-size="11" paint-order="stroke" stroke="#f8fafc" stroke-width="4" fill="#334155">${xml(edgeLabel(item))}</text>`;
    })
    .join('')}</svg>\n`;
}

const loadTS = async (relative) => {
  const module = await tsImport(
    new URL(relative, new URL('../', import.meta.url)).href,
    import.meta.url,
  );
  return module.default ?? module;
};

function graphEvidence(model) {
  return {
    nodes: model.nodes.map((item, i) => ({
      d2Id: `n${String(i).padStart(4, '0')}`,
      id: item.id,
      label: item.data.label,
      width: item.width,
      height: item.height,
    })),
    edges: model.edges.map((item) => ({
      id: item.id,
      source: item.source,
      target: item.target,
      label: edgeLabel(item),
      count: item.data.count,
      kindCounts: item.data.kindCounts,
      sourceKindCounts: item.data.sourceKindCounts,
      evidence: item.data.evidence,
    })),
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      'self-test': { type: 'boolean' },
      help: { type: 'boolean' },
      stdout: { type: 'boolean' },
      'read-only-source': { type: 'boolean' },
      out: { type: 'string' },
      d2: { type: 'string' },
    },
  });
  if (values.help) {
    console.log(
      'node scripts/compare-architecture-layouts.mjs [--out <workbench-subdir>] [--d2 /absolute/path/to/d2]\nDefault: built core on an isolated source mirror; artifacts only in the named workbench.\n--read-only-source --stdout: no writes; source scanner fallback (NOT a built-core run).\n--self-test: six focused exporter/geometry tests; no artifacts or network.',
    );
    return;
  }
  assert.ok(
    !values.stdout || values['read-only-source'],
    '--stdout requires --read-only-source (built core requires isolated storage)',
  );
  assert.ok(!values.d2 || !values.stdout, '--d2 needs a writable output directory');
  const destination = path.resolve(values.out ?? path.join(workbench, 'comparison'));
  assert.ok(
    destination.startsWith(workbench + path.sep),
    '--out must be a subdirectory of the assigned workbench',
  );
  if (!values.stdout) {
    for (
      let cursor = destination;
      cursor !== path.dirname(workbench);
      cursor = path.dirname(cursor)
    ) {
      const stat = fs.lstatSync(cursor, { throwIfNoEntry: false });
      assert.ok(!stat?.isSymbolicLink(), `Refusing symlink ancestor: ${cursor}`);
    }
    fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
    // Reject symlink redirection out of the explicitly owned artifact tree.
    assert.ok(fs.realpathSync(destination).startsWith(fs.realpathSync(workbench) + path.sep));
  }
  const [{ projectInfo, inventory, readSource }, { SourceIndex }, { buildGraph }, { layoutGraph }] =
    await Promise.all([
      loadTS('packages/core/src/filesystem.ts'),
      loadTS('packages/core/src/scanner.ts'),
      loadTS('apps/web/src/graph/model.ts'),
      loadTS('apps/web/src/graph/layout.ts'),
    ]);
  const project = projectInfo(repository),
    sourceIndex = new SourceIndex(project, 2000);
  const sourceData = sourceIndex.scan();
  assert.ok(
    !sourceData.limits.truncated && !sourceData.limits.incomplete,
    'Source scan is incomplete; refuse a misleading baseline',
  );
  const options = {
    scope: '',
    expanded: [],
    filter: { query: '', tag: '', hotspots: false },
    focusId: null,
    relationMode: 'summary',
  };
  const sourceSnapshot = {
    ...sourceData,
    project,
    revision: 0,
    tasks: [],
    claims: [],
    reviews: [],
  };
  let snapshot = sourceSnapshot,
    sourceCore = 'TypeScript SourceIndex read-only fallback; built core NOT executed';
  let mirror;
  try {
    if (!values['read-only-source']) {
      mirror = fs.mkdtempSync(path.join(destination, 'source-'));
      // Copy only files admitted by the existing scanner; never copy Git, SQLite or hidden reports.
      for (const relative of inventory(project, 2000).paths) {
        let source;
        try {
          source = readSource(project, relative, { checkIgnore: false });
        } catch {
          continue;
        }
        const target = path.join(mirror, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, source.text);
      }
      const { createWorkspace } = await import('../workspace/core/index.mjs');
      // Workbench may itself belong to another Git repository. Bound Git discovery
      // so core storage can only be the mirror's disposable .taskvision directory.
      const keys = [
        'GIT_DIR',
        'GIT_WORK_TREE',
        'GIT_COMMON_DIR',
        'GIT_INDEX_FILE',
        'GIT_CEILING_DIRECTORIES',
      ];
      const previous = new Map(keys.map((key) => [key, process.env[key]]));
      try {
        for (const key of keys) delete process.env[key];
        process.env.GIT_CEILING_DIRECTORIES = destination;
        assert.equal(
          projectInfo(mirror).storePath,
          path.join(mirror, '.taskvision/workspace.sqlite'),
        );
        const workspace = createWorkspace(mirror);
        try {
          snapshot = workspace.dispatch('snapshot');
        } finally {
          workspace.close();
        }
      } finally {
        for (const [key, value] of previous) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
      assert.ok(
        !snapshot.limits.truncated && !snapshot.limits.incomplete,
        'Mirror scan is incomplete',
      );
      sourceCore =
        'workspace/core/index.mjs createWorkspace().dispatch(snapshot), isolated source-text mirror';
    }
    const model = canonical(buildGraph(snapshot, options));
    assert.deepEqual(
      graphEvidence(model),
      graphEvidence(canonical(buildGraph(sourceSnapshot, options))),
      'Built graph differs from current source scanner; rebuild or retry after concurrent edits settle',
    );
    const evidence = graphEvidence(model),
      d2 = exportD2(model),
      samples = [],
      layouts = [];
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      const laidOut = await layoutGraph(model);
      samples.push(round(performance.now() - start));
      layouts.push(laidOut);
    }
    const laidOut = layouts[0],
      metrics = measure(laidOut);
    const geometry = (layout) => ({
      nodes: layout.nodes.map((n) => [n.id, n.position]),
      routes: layout.edges.map((e) => [e.id, e.data.points]),
    });
    assert.ok(
      layouts.every(
        (layout) => JSON.stringify(geometry(layout)) === JSON.stringify(geometry(laidOut)),
      ),
      'ELK geometry changed between identical runs',
    );
    const tala = {
      status: 'deferred',
      reason: 'No --d2 executable supplied; no TALA layout executed',
      metrics: null,
      runtimeMs: null,
    };
    const svg = renderELK(laidOut, metrics);
    if (!values.stdout) {
      // Never overwrite a user-provided symlink, even within the artifact directory.
      const write = (name, text) => {
        const target = path.join(destination, name);
        assert.ok(
          !fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink(),
          `Refusing symlink: ${name}`,
        );
        fs.writeFileSync(target, text, { mode: 0o600 });
      };
      write('architecture.d2', d2);
      write('elk.svg', svg);
      if (values.d2) {
        assert.ok(path.isAbsolute(values.d2), '--d2 must be an absolute path');
        try {
          tala.version = execFileSync(values.d2, ['--version'], {
            encoding: 'utf8',
            timeout: 12000,
          }).trim();
          assert.match(tala.version, /(?:^|\D)0\.9\.0(?:\D|$)/, 'Expected official D2 v0.9.0');
          const target = path.join(destination, 'tala.svg');
          assert.ok(!fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink());
          const start = performance.now();
          execFileSync(
            values.d2,
            [
              '--layout=tala',
              '--pad=24',
              '--scale=1',
              path.join(destination, 'architecture.d2'),
              target,
            ],
            {
              timeout: 12000,
              encoding: 'utf8',
              maxBuffer: 1024 * 1024,
              env: { ...process.env, D2_LAYOUT: 'tala' },
            },
          );
          tala.runtimeMs = round(performance.now() - start);
          assert.match(fs.readFileSync(target, 'utf8'), /<svg[\s>]/);
          tala.status = 'rendered-unmeasured';
          tala.reason =
            'SVG rendered; geometry adapter is unverified. Metrics remain null, not zero. CLI timing includes parse, layout, text measurement, render and process startup.';
        } catch (error) {
          tala.runtimeMs = null;
          tala.reason = `${error.message}${error.stderr ? ': ' + error.stderr : ''}`;
        }
      }
      const output = {
        ...result(),
        artifacts: {
          d2: path.join(destination, 'architecture.d2'),
          elkSvg: path.join(destination, 'elk.svg'),
          talaSvg:
            tala.status === 'rendered-unmeasured' ? path.join(destination, 'tala.svg') : null,
        },
      };
      write('comparison.json', JSON.stringify(output, null, 2) + '\n');
      console.log(
        JSON.stringify(
          {
            output: path.join(destination, 'comparison.json'),
            graphSha256: output.graph.sha256,
            metrics,
            tala,
          },
          null,
          2,
        ),
      );
    } else
      console.log(
        JSON.stringify({ ...result(), artifacts: { d2Source: d2, elkSvg: svg } }, null, 2),
      );

    function result() {
      return {
        schemaVersion: 1,
        environment: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          projectVersion: JSON.parse(fs.readFileSync(path.join(repository, 'package.json'), 'utf8'))
            .version,
          head: project.head,
          branch: project.branch,
        },
        source: {
          core: sourceCore,
          sourceFiles: snapshot.files.length,
          limits: snapshot.limits,
          builtCoreSha256: sha256(
            fs.readFileSync(path.join(repository, 'workspace/core/index.mjs')),
          ),
          filesSha256: sha256(JSON.stringify(sourceData.hashes)),
          options,
        },
        graph: {
          ...evidence,
          sha256: sha256(JSON.stringify(evidence)),
          d2Sha256: sha256(d2),
          semantics:
            'A → B means observed static source dependency, not runtime call/data flow or guaranteed breakage',
        },
        elk: {
          metrics,
          samplesMs: samples,
          coldSampleIncludes:
            'Dynamic ELK import + engine creation + layout (tsx source imports excluded)',
          warmSamplesInclude: 'Production layoutGraph on identical input and existing engine',
          deterministicAcrossThreeRuns: true,
          placements: laidOut.nodes.map((n) => ({
            id: n.id,
            ...n.position,
            width: n.width,
            height: n.height,
          })),
          routes: laidOut.edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            points: e.data.points,
          })),
        },
        tala,
        limitations: [
          'ELK metrics are production layoutGraph raw polylines; React Flow Smart Edge live A* routes are not measured.',
          'Proper crossings count unique interior segment intersections per edge pair; endpoint/T contacts are excluded. Shared collinear paths are separate.',
          'Node overlaps are positive-area rectangle intersections. Intrusions exclude source/target nodes. Label overlaps are unmeasured (null).',
          'D2 gets the same directed node/edge identities, labels and requested sizes, but performs its own font measurement, labels, ports, routing and padding; ELK does not reserve edge-label boxes.',
          'D2 SVG viewBox, nested translations, padding and hashed DOM IDs must be mapped before inferring graph coordinates; SVG x/y or path data alone are not source node positions.',
          'D2 CLI compile/render runtime is not comparable to ELK in-process layout-only runtime. No TALA superiority/performance claim follows from this baseline.',
          'Source snapshot excludes persisted knowledge/tasks/reviews and uses static observed imports only. Concurrent working tree edits change graph hashes.',
        ],
      };
    }
  } finally {
    if (mirror) fs.rmSync(mirror, { recursive: true, force: true });
  }
}

// Run without a build, network, database, or artifact writes:
// node scripts/compare-architecture-layouts.mjs --self-test
async function selfTest() {
  test('D2 export is canonical, escapes labels and preserves arrow direction', () => {
    const model = {
      nodes: [node('b', 30, 0), node('a', 0, 0)],
      edges: [
        edge('ab', 'a', 'b', [
          { x: 10, y: 5 },
          { x: 30, y: 5 },
        ]),
      ],
    };
    model.nodes[1].data.label = 'a "quoted"\nlabel';
    const source = exportD2(model);
    assert.equal(source, exportD2({ ...model, nodes: [...model.nodes].reverse() }));
    assert.ok(source.includes('n0000 -> n0001: "runtime × 1"'));
    assert.ok(source.includes('a \\"quoted\\"\\nlabel'));
    assert.equal((source.match(/^n\d+ -> n\d+:/gm) ?? []).length, model.edges.length);
  });
  test('metrics detect a real crossing, bends and lengths without node overlaps', () => {
    const result = measure({
      nodes: [node('a', -20, -20), node('b', 30, 30)],
      edges: [
        edge('x', 'a', 'b', [
          { x: 0, y: 10 },
          { x: 20, y: 10 },
        ]),
        edge('y', 'a', 'b', [
          { x: 10, y: 0 },
          { x: 10, y: 20 },
          { x: 20, y: 20 },
        ]),
      ],
    });
    assert.equal(result.properCrossings, 1);
    assert.equal(result.nodeOverlapPairs.length, 0);
    assert.equal(result.bends, 1);
    assert.equal(result.totalEdgeLength, 50);
  });
  test('touching is not overlap; collinear routing is reported separately', () => {
    const result = measure({
      nodes: [node('a', 0, 0), node('b', 10, 0)],
      edges: [
        edge('x', 'a', 'b', [
          { x: 0, y: 20 },
          { x: 20, y: 20 },
        ]),
        edge('y', 'a', 'b', [
          { x: 10, y: 20 },
          { x: 30, y: 20 },
        ]),
      ],
    });
    assert.equal(result.nodeOverlapPairs.length, 0);
    assert.equal(result.properCrossings, 0);
    assert.equal(result.collinearEdgeOverlapPairs.length, 1);
  });
  test('node overlap and unrelated node intrusion are measured independently', () => {
    const result = measure({
      nodes: [node('a', 0, 0), node('b', 5, 5), node('c', 30, 0)],
      edges: [
        edge('x', 'a', 'c', [
          { x: 0, y: 8 },
          { x: 40, y: 8 },
        ]),
      ],
    });
    assert.deepEqual(result.nodeOverlapPairs, [['a', 'b']]);
    assert.deepEqual(result.edgeNodeIntrusions, [['x', 'b']]);
  });
  test('segment endpoint contacts and parallel paths are not proper crossings', () => {
    assert.equal(
      properIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }),
      null,
    );
    assert.equal(
      properIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 }),
      null,
    );
  });
  test('missing routes or invalid coordinates fail closed instead of scoring zero', () => {
    assert.throws(() => measure({ nodes: [node('a', 0, 0)], edges: [edge('x', 'a', 'a', [])] }));
    assert.throws(() => measure({ nodes: [node('a', NaN, 0)], edges: [] }));
  });
}

const node = (id, x, y) => ({ id, position: { x, y }, width: 10, height: 10, data: { label: id } });
const edge = (id, source, target, points) => ({
  id,
  source,
  target,
  data: { points, kindCounts: { runtime: 1 } },
});

if (process.argv.includes('--self-test')) await selfTest();
else await main();
