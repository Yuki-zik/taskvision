import * as vscode from 'vscode';
import type { TreeNode, HighlightSettings } from '../model';
import { cloneJson } from '../validation';
import * as highlightScheme from '../highlightScheme';

// REUSE: Legacy picker values and independent channel settings remain canonical.
export function registerAppearanceCommands(context: vscode.ExtensionContext): void {
  function resolveConfigTarget() {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      return vscode.ConfigurationTarget.Workspace;
    }
    return vscode.ConfigurationTarget.Global;
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('taskvision.setScheme', function (node: TreeNode) {
      if (node && node.tag) {
        const currentConfig = vscode.workspace.getConfiguration('taskvision.highlights');
        const customHighlight = currentConfig.get<Record<string, HighlightSettings>>(
          'customHighlight',
          {},
        );
        const currentScheme = (customHighlight[node.tag] && customHighlight[node.tag].scheme) || '';
        const customHighlightTarget = resolveConfigTarget();

        const items = [
          {
            label: '$(zap) Neon',
            description: currentScheme === 'neon' ? '$(check) Current' : '',
            detail: 'Enable glow preset only',
            value: 'neon',
          },
          {
            label: '$(browser) Glass',
            description: currentScheme === 'glass' ? '$(check) Current' : '',
            detail: 'Enable glass preset only',
            value: 'glass',
          },
          {
            label: '$(sparkle) Neon + Glass',
            description: currentScheme === 'neon+glass' ? '$(check) Current' : '',
            detail: 'Enable both glow and glass presets',
            value: 'neon+glass',
          },
          {
            label: '$(circle-slash) None',
            description: !currentScheme || currentScheme === '' ? '$(check) Current' : '',
            detail: 'Clear scheme preset',
            value: 'none',
          },
        ];

        vscode.window
          .showQuickPick(items, {
            placeHolder: 'Choose a highlight scheme for ' + node.tag,
            matchOnDetail: true,
          })
          .then(function (selection) {
            if (!selection) {
              return;
            }

            const updated = cloneJson(
              currentConfig.get<Record<string, HighlightSettings>>('customHighlight', {}),
            );
            if (updated[node.tag!] === undefined) {
              updated[node.tag!] = {};
            }

            if (selection.value === 'none') {
              delete updated[node.tag!].scheme;
            } else {
              updated[node.tag!].scheme = selection.value;
            }

            currentConfig.update('customHighlight', updated, customHighlightTarget);
          });
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('taskvision.setHighlightSchemeForAllTags', function () {
      const currentConfig = vscode.workspace.getConfiguration('taskvision.highlights');
      const customHighlight = currentConfig.get<Record<string, HighlightSettings>>(
        'customHighlight',
        {},
      );
      const defaultHighlight = currentConfig.get<HighlightSettings>('defaultHighlight', {});
      const configTarget = resolveConfigTarget();

      const items = [
        {
          label: '$(zap) Neon',
          detail: 'Enable glow preset for every tag',
          value: 'neon',
        },
        {
          label: '$(browser) Glass',
          detail: 'Enable glass preset for every tag',
          value: 'glass',
        },
        {
          label: '$(sparkle) Neon + Glass',
          detail: 'Enable both glow and glass presets for every tag',
          value: 'neon+glass',
        },
        {
          label: '$(circle-slash) None',
          detail: 'Clear scheme preset for every tag',
          value: 'none',
        },
      ];

      vscode.window
        .showQuickPick(items, {
          placeHolder: 'Choose a highlight scheme to apply to ALL tags',
          matchOnDetail: true,
        })
        .then(function (selection) {
          if (!selection) {
            return;
          }

          const updated = highlightScheme.applySchemeToAllTags(
            customHighlight,
            defaultHighlight,
            selection.value,
          );

          return Promise.resolve(
            currentConfig.update('customHighlight', updated.customHighlight, configTarget),
          )
            .then(function () {
              return currentConfig.update(
                'defaultHighlight',
                updated.defaultHighlight,
                configTarget,
              );
            })
            .then(function () {
              vscode.window.showInformationMessage(
                'Applied "' + selection.value + '" highlight scheme to all tags',
              );
            });
        });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('taskvision.customizeAppearance', function (node: TreeNode) {
      if (node && node.tag) {
        const currentConfig = vscode.workspace.getConfiguration('taskvision.highlights');
        const customHighlight = currentConfig.get<Record<string, HighlightSettings>>(
          'customHighlight',
          {},
        );
        const tagConfig = customHighlight[node.tag] || {};
        const currentScheme = tagConfig.scheme || '';

        const neonOn = currentScheme === 'neon' || currentScheme === 'neon+glass';
        const glassOn = currentScheme === 'glass' || currentScheme === 'neon+glass';
        const customHighlightTarget = resolveConfigTarget();

        const mainItems = [
          {
            label: '$(zap) Toggle Glow Effect',
            description: neonOn ? '$(check) ON' : '$(circle-slash) OFF',
            detail: 'Enable or disable Neon glow preset',
            value: 'toggle-neon',
          },
          {
            label: '$(browser) Toggle Glass Effect',
            description: glassOn ? '$(check) ON' : '$(circle-slash) OFF',
            detail: 'Enable or disable Glass background preset',
            value: 'toggle-glass',
          },
          {
            label: '$(screen-full) Set Effect Scope',
            detail: 'Set independent scopes for color / glow / glass / font channels',
            value: 'scope',
          },
          {
            label: '$(symbol-color) Set Foreground Color',
            detail:
              'Set text color for ' +
              node.tag +
              ' (current: ' +
              (tagConfig.foreground || 'default') +
              ')',
            value: 'foreground',
          },
          {
            label: '$(symbol-misc) Set Icon',
            detail:
              'Change icon for ' + node.tag + ' (current: ' + (tagConfig.icon || 'default') + ')',
            value: 'icon',
          },
          {
            label: '$(bold) Set Font Style',
            detail: 'Set bold / italic style for tag font channel',
            value: 'font',
          },
        ];

        vscode.window
          .showQuickPick(mainItems, {
            placeHolder: 'Customize appearance for ' + node.tag,
            matchOnDetail: true,
          })
          .then(function (selection) {
            if (!selection) {
              return;
            }

            const updateConfigValues = function (values: Partial<HighlightSettings>) {
              const cfg = vscode.workspace.getConfiguration('taskvision.highlights');
              const updated = cloneJson(
                cfg.get<Record<string, HighlightSettings>>('customHighlight', {}),
              );
              if (!updated[node.tag!]) {
                updated[node.tag!] = {};
              }
              (Object.keys(values) as (keyof HighlightSettings)[]).forEach(function (key) {
                const val = values[key];
                if (val === undefined) {
                  delete updated[node.tag!][key];
                } else {
                  Object.assign(updated[node.tag!], { [key]: val });
                }
              });
              return cfg.update('customHighlight', updated, customHighlightTarget);
            };

            const updateConfig = function <K extends keyof HighlightSettings>(
              key: K,
              val: HighlightSettings[K],
            ) {
              const values: HighlightSettings = {};
              values[key] = val;
              return updateConfigValues(values);
            };

            const scopeValues = [
              {
                label: '$(symbol-key) Tag Only',
                detail: 'Only highlight tag keyword',
                value: 'tag',
              },
              {
                label: '$(symbol-text) Tag + Content',
                detail: 'Highlight from tag through comment text',
                value: 'text',
              },
              {
                label: '$(comment-discussion) Text + Comment',
                detail: 'Highlight from comment content to line end',
                value: 'text-and-comment',
              },
              {
                label: '$(comment) Tag + Comment',
                detail: 'Alias of text-and-comment',
                value: 'tag-and-comment',
              },
              {
                label: '$(symbol-enum) Tag + Sub Tag',
                detail: 'Highlight tag and detected sub tag',
                value: 'tag-and-subTag',
              },
              {
                label: '$(list-unordered) Line',
                detail: 'Highlight text range of the full line',
                value: 'line',
              },
              {
                label: '$(symbol-file) Whole Line',
                detail: 'Highlight entire visual line width',
                value: 'whole-line',
              },
              { label: '$(circle-slash) None', detail: 'Disable this channel', value: 'none' },
            ];

            function showScopePicker(
              currentValue: string | undefined,
              placeHolder: string,
              allowInherit?: boolean,
            ) {
              const items = scopeValues.map(function (item) {
                return {
                  label: item.label,
                  detail: item.detail,
                  description: item.value === currentValue ? '$(check)' : '',
                  value: item.value,
                };
              });

              if (allowInherit) {
                items.unshift({
                  label: '$(debug-step-over) Inherit default',
                  detail: 'Remove override and use defaultHighlight channel scope',
                  description: currentValue === undefined ? '$(check)' : '',
                  value: 'inherit',
                });
              }

              return vscode.window.showQuickPick(items, { placeHolder: placeHolder });
            }

            const computeScheme = function (wantNeon: boolean, wantGlass: boolean) {
              if (wantNeon && wantGlass) return 'neon+glass';
              if (wantNeon) return 'neon';
              if (wantGlass) return 'glass';
              return undefined;
            };

            if (selection.value === 'toggle-neon') {
              const newNeon = !neonOn;
              const newScheme = computeScheme(newNeon, glassOn);
              updateConfig('scheme', newScheme);
              vscode.window.showInformationMessage(node.tag + ': Glow ' + (newNeon ? 'ON' : 'OFF'));
            } else if (selection.value === 'toggle-glass') {
              const newGlass = !glassOn;
              const newScheme = computeScheme(neonOn, newGlass);
              updateConfig('scheme', newScheme);
              vscode.window.showInformationMessage(
                node.tag + ': Glass ' + (newGlass ? 'ON' : 'OFF'),
              );
            } else if (selection.value === 'scope') {
              const scopeConfigItems = [
                {
                  label: '$(symbol-color) Set Color Scope (colorType)',
                  detail: 'Controls where foreground color is applied',
                  description: 'Current: ' + (tagConfig.colorType || '(inherit default)'),
                  value: 'scope-color',
                },
                {
                  label: '$(zap) Set Glow Scope (glowType)',
                  detail: 'Controls where glow text-shadow is applied',
                  description: 'Current: ' + (tagConfig.glowType || '(inherit default)'),
                  value: 'scope-glow',
                },
                {
                  label: '$(browser) Set Glass Scope (glassType)',
                  detail: 'Controls where glass background is applied',
                  description: 'Current: ' + (tagConfig.glassType || '(inherit default)'),
                  value: 'scope-glass',
                },
                {
                  label: '$(bold) Set Font Scope (fontType)',
                  detail: 'Controls where font style is applied',
                  description: 'Current: ' + (tagConfig.fontType || '(inherit default)'),
                  value: 'scope-font',
                },
              ];

              vscode.window
                .showQuickPick(scopeConfigItems, {
                  placeHolder: 'Choose a channel scope to edit for ' + node.tag,
                })
                .then(function (scopeConfig) {
                  if (!scopeConfig) {
                    return;
                  }

                  if (scopeConfig.value === 'scope-color') {
                    showScopePicker(
                      tagConfig.colorType,
                      'Set colorType for ' + node.tag,
                      true,
                    ).then(function (scopeValue) {
                      if (scopeValue) {
                        updateConfig(
                          'colorType',
                          scopeValue.value === 'inherit' ? undefined : scopeValue.value,
                        );
                      }
                    });
                  } else if (scopeConfig.value === 'scope-glow') {
                    showScopePicker(tagConfig.glowType, 'Set glowType for ' + node.tag, true).then(
                      function (scopeValue) {
                        if (scopeValue) {
                          updateConfig(
                            'glowType',
                            scopeValue.value === 'inherit' ? undefined : scopeValue.value,
                          );
                        }
                      },
                    );
                  } else if (scopeConfig.value === 'scope-glass') {
                    showScopePicker(
                      tagConfig.glassType,
                      'Set glassType for ' + node.tag,
                      true,
                    ).then(function (scopeValue) {
                      if (scopeValue) {
                        updateConfig(
                          'glassType',
                          scopeValue.value === 'inherit' ? undefined : scopeValue.value,
                        );
                      }
                    });
                  } else if (scopeConfig.value === 'scope-font') {
                    showScopePicker(tagConfig.fontType, 'Set fontType for ' + node.tag, true).then(
                      function (scopeValue) {
                        if (scopeValue) {
                          updateConfig(
                            'fontType',
                            scopeValue.value === 'inherit' ? undefined : scopeValue.value,
                          );
                        }
                      },
                    );
                  }
                });
            } else if (selection.value === 'foreground') {
              vscode.window
                .showInputBox({
                  prompt: 'Input foreground color for ' + node.tag + ' (Hex)',
                  placeHolder: '#FF0044',
                  value: tagConfig.foreground || '',
                  validateInput: function (value) {
                    if (!value.match(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/)) {
                      return 'Please input a valid hex color (e.g. #FF0044)';
                    }
                    return null;
                  },
                })
                .then(function (color) {
                  if (color) {
                    updateConfig('foreground', color);
                  }
                });
            } else if (selection.value === 'icon') {
              const iconItems: (vscode.QuickPickItem & { value: string })[] = [
                { label: '$(flame) flame', value: 'flame' },
                { label: '$(bug) bug', value: 'bug' },
                { label: '$(check) check', value: 'check' },
                { label: '$(alert) alert', value: 'alert' },
                { label: '$(bookmark) bookmark', value: 'bookmark' },
                { label: '$(star) star', value: 'star' },
                { label: '$(tools) tools', value: 'tools' },
                { label: '$(info) info', value: 'info' },
                { label: '$(tasklist) tasklist', value: 'tasklist' },
                { label: '$(eye) eye', value: 'eye' },
                { label: '$(heart) heart', value: 'heart' },
                { label: '$(x-circle) x-circle', value: 'x-circle' },
                { label: '$(issue-opened) issue-opened', value: 'issue-opened' },
                { label: '$(issue-closed) issue-closed', value: 'issue-closed' },
                { label: '$(rocket) rocket', value: 'rocket' },
                { label: '$(zap) zap', value: 'zap' },
              ];

              iconItems.forEach(function (item) {
                if (item.value === tagConfig.icon) {
                  item.description = '$(check)';
                }
              });

              vscode.window
                .showQuickPick(iconItems, {
                  placeHolder: 'Choose icon for ' + node.tag,
                })
                .then(function (icon) {
                  if (icon) {
                    updateConfig('icon', icon.value);
                  }
                });
            } else if (selection.value === 'font') {
              const fontItems = [
                {
                  label: '$(bold) Bold',
                  detail: 'Bold',
                  description:
                    tagConfig.fontWeight === 'bold' && tagConfig.fontStyle !== 'italic'
                      ? '$(check)'
                      : '',
                  fontWeight: 'bold',
                  fontStyle: 'normal',
                },
                {
                  label: '$(italic) Italic',
                  detail: 'Italic',
                  description:
                    tagConfig.fontWeight !== 'bold' && tagConfig.fontStyle === 'italic'
                      ? '$(check)'
                      : '',
                  fontWeight: 'normal',
                  fontStyle: 'italic',
                },
                {
                  label: '$(bold) Bold + Italic',
                  detail: 'Bold + Italic',
                  description:
                    tagConfig.fontWeight === 'bold' && tagConfig.fontStyle === 'italic'
                      ? '$(check)'
                      : '',
                  fontWeight: 'bold',
                  fontStyle: 'italic',
                },
                {
                  label: '$(symbol-text) Normal',
                  detail: 'Normal',
                  description: !tagConfig.fontWeight && !tagConfig.fontStyle ? '$(check)' : '',
                  fontWeight: 'normal',
                  fontStyle: 'normal',
                },
              ];

              vscode.window
                .showQuickPick(fontItems, {
                  placeHolder: 'Choose font style for ' + node.tag,
                })
                .then(function (font) {
                  if (font) {
                    updateConfigValues({ fontWeight: font.fontWeight, fontStyle: font.fontStyle });
                  }
                });
            }
          });
      }
    }),
  );
}
