# Extension TypeScript migration

The extension source of truth is `src/**/*.ts`; no handwritten legacy `src/*.js`
implementation remains. The canonical annotation grammar and its existing named
exports remain in `src/annotationParser.ts`. Static name arrays are typed default
exports. Editor positions and legacy sidecar schemas retain their original units
and versions; the extension does not import the Node 22 SQLite core.

Reused source contracts: the scanner's ripgrep argument/result handling, the atomic
JSON sidecar writer, task/context/session normalization, four independent highlight
channels, and the directory/tag/subtag tree renderer. `annotationPolicy.ts` now owns
the existing source-ID policy and export scope selection. `commands/appearance.ts`
owns the existing appearance pickers and configuration writes. AI export delegates
to one report-before-baseline helper in the existing `aiContext.ts` module.

## Regression coverage

All original tests remain active. Imports now resolve the generated unbundled CJS
modules under `out/legacy/src`; source inspections read `.ts`. Nine source-string
checks were replaced with functional assertions under the same test names:

- Workspace/global configuration target selection.
- Tag-specific highlight updates and unrelated-tag preservation.
- Independent color/glow/glass/font scopes, including inheritance.
- A font selection writes both style fields in one update.
- Apply a scheme to every configured tag and the default settings.
- On-demand source IDs for statuses, notes, priorities and references.
- Export scope selection, including an explicitly empty scope.
- Report generation sees the previous baseline before the baseline advances.
- Highlight trace messages reach the injected debug logger.

`extensionRuntime.tests.js` adds activation/registration, task/context/review tree
rendering and counts, virtual-row identities, concurrent bridge startup, machine
runtime selection, explicit stop, and startup cancellation. Subprocesses are
injected fakes; tests do not start a Web service or call external APIs.

## Focused validation

```sh
./node_modules/.bin/tsc -p tsconfig.extension.json --noEmit
node scripts/build.mjs --legacy
./node_modules/.bin/qunit
```

The extension config enables `strict`, unused-local/parameter checks and switch
fallthrough checks. Public declaration output was also inspected for accidental
`any` types. Declaration output is optional and can be generated outside the tree:

```sh
./node_modules/.bin/tsc -p tsconfig.extension.json --noEmit false --declaration --emitDeclarationOnly --outDir /tmp/taskvision-extension-declarations
```

## Integration owned by main

The legacy build must include all recursive `src/**/*.ts` entry points and preserve
`out/legacy/src/<relative module>.js` for tests. The production entry is
`src/extension.ts`, bundled as CJS with `vscode` external and Node 16 compatibility.
Both builds are already supported by `scripts/build.mjs` at the time of validation.

Outside this worker's ownership, `buildCodiconNames.js` still targets
`src/codiconNames.js`, `workspace/scripts/prepublish.mjs` still requires that old
path, and the retired Webpack config still points to `src/extension.js`. Update or
retire those legacy entry points in the build integration. The prepublish check
can load the emitted `out/legacy/src/codiconNames.js` default export after the
legacy build, or validate the typed data through the active build. No dependency,
manifest, shared contract, governance, or release files were edited by this worker.
