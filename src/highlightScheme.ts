import { cloneJson } from './validation';
import type { HighlightSettings } from './model';
function shouldClear(scheme?: string | null) {
  return scheme === undefined || scheme === null || scheme === '' || scheme === 'none';
}

function applyScheme(target: HighlightSettings, scheme?: string | null) {
  if (!target || typeof target !== 'object') {
    return;
  }
  if (shouldClear(scheme)) {
    delete target.scheme;
  } else {
    target.scheme = scheme || undefined;
  }
}

function applySchemeToAllTags(
  customHighlight: Record<string, HighlightSettings> | undefined,
  defaultHighlight: HighlightSettings | undefined,
  scheme?: string | null,
) {
  const updatedCustom = cloneJson(customHighlight || {});
  const updatedDefault = cloneJson(defaultHighlight || {});

  Object.keys(updatedCustom).forEach(function (tag) {
    applyScheme(updatedCustom[tag], scheme);
  });

  applyScheme(updatedDefault, scheme);

  return { customHighlight: updatedCustom, defaultHighlight: updatedDefault };
}

export { applySchemeToAllTags };
