import assert from 'node:assert/strict';
import test from 'node:test';
import { RELATION_CATEGORIES, relationOffset } from '../src/graph/model';
import { MAP_ZOOM_THRESHOLD, nodeSize, readingMode } from '../src/graph/presentation';

test('overview and detail use the agreed measured module and file geometry', () => {
  assert.deepEqual(nodeSize('module', false), { width: 304, height: 196 });
  assert.deepEqual(nodeSize('file', false), { width: 292, height: 184 });
  assert.deepEqual(nodeSize('module', true), { width: 328, height: 248 });
  assert.deepEqual(nodeSize('file', true), { width: 316, height: 236 });
});

test('far zoom prioritizes map reading even when detail is enabled', () => {
  for (const detailed of [false, true]) {
    assert.equal(readingMode(0.4, detailed), 'map');
    assert.equal(readingMode(MAP_ZOOM_THRESHOLD - 0.001, detailed), 'map');
  }
  assert.equal(readingMode(MAP_ZOOM_THRESHOLD, false), 'overview');
  assert.equal(readingMode(MAP_ZOOM_THRESHOLD, true), 'detail');
  assert.equal(readingMode(1.2, false), 'overview');
  assert.equal(readingMode(1.2, true), 'detail');
});

test('zoom changes reading mode without changing geometry or clipping any relation port', () => {
  for (const kind of ['module', 'file'] as const) {
    for (const detailed of [false, true]) {
      const before = { ...nodeSize(kind, detailed) };
      for (const zoom of [0.3, 0.5, 0.679, 0.68, 1, 2]) {
        readingMode(zoom, detailed);
        assert.deepEqual(nodeSize(kind, detailed), before);
      }
      for (const category of RELATION_CATEGORIES) {
        const center = before.height / 2 + relationOffset(category);
        assert.ok(center >= 12 && center <= before.height - 12, `${kind}: ${category}`);
      }
    }
  }
});
