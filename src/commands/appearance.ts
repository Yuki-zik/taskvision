import * as vscode from 'vscode';
import type { TreeNode, HighlightSettings } from '../model';
import { cloneJson } from '../validation';
import * as highlightScheme from '../highlightScheme';

const tt = (english: string, chinese: string): string =>
  /^zh(?:[-_]|$)/i.test(vscode.env.language || '') ? chinese : english;


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
            label: tt('$(zap) Neon', '$(zap) 霓虹'),
            description: currentScheme === 'neon' ? tt('$(check) Current', '$(check) 当前使用') : '',
            detail: tt('Enable glow preset only', '仅启用霓虹辉光'),
            value: 'neon',
          },
          {
            label: tt('$(browser) Glass', '$(browser) 玻璃'),
            description: currentScheme === 'glass' ? tt('$(check) Current', '$(check) 当前使用') : '',
            detail: tt('Enable glass preset only', '仅启用玻璃背景'),
            value: 'glass',
          },
          {
            label: tt('$(sparkle) Neon + Glass', '$(sparkle) 霓虹 + 玻璃'),
            description: currentScheme === 'neon+glass' ? tt('$(check) Current', '$(check) 当前使用') : '',
            detail: tt('Enable both glow and glass presets', '同时启用霓虹辉光和玻璃背景'),
            value: 'neon+glass',
          },
          {
            label: tt('$(circle-slash) None', '$(circle-slash) 不使用'),
            description: !currentScheme || currentScheme === '' ? tt('$(check) Current', '$(check) 当前使用') : '',
            detail: tt('Clear scheme preset', '取消预设样式'),
            value: 'none',
          },
        ];

        return vscode.window
          .showQuickPick(items, {
            placeHolder: tt('Choose a highlight scheme for ', '为标签选择高亮方案：') + node.tag,
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

            return currentConfig.update('customHighlight', updated, customHighlightTarget);
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
          label: tt('$(zap) Neon', '$(zap) 霓虹'),
          detail: tt('Enable glow preset for every tag', '为所有标签启用霓虹辉光'),
          value: 'neon',
        },
        {
          label: tt('$(browser) Glass', '$(browser) 玻璃'),
          detail: tt('Enable glass preset for every tag', '为所有标签启用玻璃背景'),
          value: 'glass',
        },
        {
          label: tt('$(sparkle) Neon + Glass', '$(sparkle) 霓虹 + 玻璃'),
          detail: tt('Enable both glow and glass presets for every tag', '为所有标签启用霓虹与玻璃效果'),
          value: 'neon+glass',
        },
        {
          label: tt('$(circle-slash) None', '$(circle-slash) 不使用'),
          detail: tt('Clear scheme preset for every tag', '清除所有标签的预设方案'),
          value: 'none',
        },
      ];

      return vscode.window
        .showQuickPick(items, {
          placeHolder: tt('Choose a highlight scheme to apply to ALL tags', '选择应用到全部标签的高亮方案'),
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
                tt('Applied "', '已为全部标签应用“') + selection.value + tt('" highlight scheme to all tags', '”高亮方案'),
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
            label: tt('$(zap) Toggle Glow Effect', '$(zap) 切换辉光效果'),
            description: neonOn ? tt('$(check) ON', '$(check) 已开启') : tt('$(circle-slash) OFF', '$(circle-slash) 已关闭'),
            detail: tt('Enable or disable Neon glow preset', '启用或关闭霓虹辉光'),
            value: 'toggle-neon',
          },
          {
            label: tt('$(browser) Toggle Glass Effect', '$(browser) 切换玻璃效果'),
            description: glassOn ? tt('$(check) ON', '$(check) 已开启') : tt('$(circle-slash) OFF', '$(circle-slash) 已关闭'),
            detail: tt('Enable or disable Glass background preset', '启用或关闭玻璃背景'),
            value: 'toggle-glass',
          },
          {
            label: tt('$(screen-full) Set Effect Scope', '$(screen-full) 调整效果范围'),
            detail: tt('Set independent scopes for color / glow / glass / font channels', '分别设置颜色、辉光、玻璃、字体四个通道的范围'),
            value: 'scope',
          },
          {
            label: tt('$(symbol-color) Set Foreground Color', '$(symbol-color) 设置文字颜色'),
            detail:
              tt('Set text color for ', '设置标签文字颜色：') +
              node.tag +
              tt(' (current: ', '（当前：') +
              (tagConfig.foreground || tt('default', '默认')) +
              tt(')', '）'),
            value: 'foreground',
          },
          {
            label: tt('$(symbol-misc) Set Icon', '$(symbol-misc) 设置图标'),
            detail:
              tt('Change icon for ', '修改标签图标：') + node.tag + tt(' (current: ', '（当前：') + (tagConfig.icon || tt('default', '默认')) + tt(')', '）'),
            value: 'icon',
          },
          {
            label: tt('$(bold) Set Font Style', '$(bold) 设置字体样式'),
            detail: tt('Set bold / italic style for tag font channel', '设置标签字体的粗体或斜体'),
            value: 'font',
          },
        ];

        vscode.window
          .showQuickPick(mainItems, {
            placeHolder: tt('Customize appearance for ', '自定义标签外观：') + node.tag,
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
                label: tt('$(symbol-key) Tag Only', '$(symbol-key) 仅标签'),
                detail: tt('Only highlight tag keyword', '仅高亮 CORE、TODO 等标签文字'),
                value: 'tag',
              },
              {
                label: tt('$(symbol-text) Tag + Content', '$(symbol-text) 标签与内容'),
                detail: tt('Highlight from tag through comment text', '高亮标签及后面的注释内容'),
                value: 'text',
              },
              {
                label: tt('$(comment-discussion) Text + Comment', '$(comment-discussion) 正文与注释'),
                detail: tt('Highlight from comment content to line end', '从注释正文高亮到行末'),
                value: 'text-and-comment',
              },
              {
                label: tt('$(comment) Tag + Comment', '$(comment) 标签与注释'),
                detail: tt('Alias of text-and-comment', '与 text-and-comment 相同'),
                value: 'tag-and-comment',
              },
              {
                label: tt('$(symbol-enum) Tag + Sub Tag', '$(symbol-enum) 标签与子标签'),
                detail: tt('Highlight tag and detected sub tag', '高亮标签与识别出的子标签'),
                value: 'tag-and-subTag',
              },
              {
                label: tt('$(list-unordered) Line', '$(list-unordered) 整行文本'),
                detail: tt('Highlight text range of the full line', '高亮整行的文本范围'),
                value: 'line',
              },
              {
                label: tt('$(symbol-file) Whole Line', '$(symbol-file) 整行宽度'),
                detail: tt('Highlight entire visual line width', '高亮编辑器中整行的可视宽度'),
                value: 'whole-line',
              },
              { label: tt('$(circle-slash) None', '$(circle-slash) 不使用'), detail: tt('Disable this channel', '禁用此通道'), value: 'none' },
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
                  label: tt('$(debug-step-over) Inherit default', '$(debug-step-over) 继承默认值'),
                  detail: tt('Remove override and use defaultHighlight channel scope', '移除单标签覆盖，继承默认高亮的通道范围'),
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
              vscode.window.showInformationMessage(node.tag + tt(': Glow ', '：辉光') + (newNeon ? tt('ON', '已开启') : tt('OFF', '已关闭')));
            } else if (selection.value === 'toggle-glass') {
              const newGlass = !glassOn;
              const newScheme = computeScheme(neonOn, newGlass);
              updateConfig('scheme', newScheme);
              vscode.window.showInformationMessage(
                node.tag + tt(': Glass ', '：玻璃') + (newGlass ? tt('ON', '已开启') : tt('OFF', '已关闭')),
              );
            } else if (selection.value === 'scope') {
              const scopeConfigItems = [
                {
                  label: tt('$(symbol-color) Set Color Scope (colorType)', '$(symbol-color) 颜色范围（colorType）'),
                  detail: tt('Controls where foreground color is applied', '控制文字颜色应用到哪些内容'),
                  description: tt('Current: ', '当前：') + (tagConfig.colorType || tt('(inherit default)', '（继承默认值）')),
                  value: 'scope-color',
                },
                {
                  label: tt('$(zap) Set Glow Scope (glowType)', '$(zap) 辉光范围（glowType）'),
                  detail: tt('Controls where glow text-shadow is applied', '控制霓虹文字辉光的范围'),
                  description: tt('Current: ', '当前：') + (tagConfig.glowType || tt('(inherit default)', '（继承默认值）')),
                  value: 'scope-glow',
                },
                {
                  label: tt('$(browser) Set Glass Scope (glassType)', '$(browser) 玻璃范围（glassType）'),
                  detail: tt('Controls where glass background is applied', '控制玻璃背景的覆盖范围'),
                  description: tt('Current: ', '当前：') + (tagConfig.glassType || tt('(inherit default)', '（继承默认值）')),
                  value: 'scope-glass',
                },
                {
                  label: tt('$(bold) Set Font Scope (fontType)', '$(bold) 字体范围（fontType）'),
                  detail: tt('Controls where font style is applied', '控制粗体／斜体等字体效果的范围'),
                  description: tt('Current: ', '当前：') + (tagConfig.fontType || tt('(inherit default)', '（继承默认值）')),
                  value: 'scope-font',
                },
              ];

              vscode.window
                .showQuickPick(scopeConfigItems, {
                  placeHolder: tt('Choose a channel scope to edit for ', '选择要调整的高亮通道：') + node.tag,
                })
                .then(function (scopeConfig) {
                  if (!scopeConfig) {
                    return;
                  }

                  if (scopeConfig.value === 'scope-color') {
                    showScopePicker(
                      tagConfig.colorType,
                      tt('Set colorType for ', '设置文字颜色范围：') + node.tag,
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
                    showScopePicker(tagConfig.glowType, tt('Set glowType for ', '设置霓虹辉光范围：') + node.tag, true).then(
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
                      tt('Set glassType for ', '设置玻璃背景范围：') + node.tag,
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
                    showScopePicker(tagConfig.fontType, tt('Set fontType for ', '设置字体效果范围：') + node.tag, true).then(
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
                  prompt: tt('Input foreground color for ', '输入标签文字颜色：') + node.tag + tt(' (Hex)', '（十六进制颜色）'),
                  placeHolder: '#FF0044',
                  value: tagConfig.foreground || '',
                  validateInput: function (value) {
                    if (!value.match(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/)) {
                      return tt('Please input a valid hex color (e.g. #FF0044)', '请输入有效的十六进制颜色，如 #FF0044');
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
                  placeHolder: tt('Choose icon for ', '选择标签图标：') + node.tag,
                })
                .then(function (icon) {
                  if (icon) {
                    updateConfig('icon', icon.value);
                  }
                });
            } else if (selection.value === 'font') {
              const fontItems = [
                {
                  label: tt('$(bold) Bold', '$(bold) 粗体'),
                  detail: tt('Bold', '粗体'),
                  description:
                    tagConfig.fontWeight === 'bold' && tagConfig.fontStyle !== 'italic'
                      ? '$(check)'
                      : '',
                  fontWeight: 'bold',
                  fontStyle: 'normal',
                },
                {
                  label: tt('$(italic) Italic', '$(italic) 斜体'),
                  detail: tt('Italic', '斜体'),
                  description:
                    tagConfig.fontWeight !== 'bold' && tagConfig.fontStyle === 'italic'
                      ? '$(check)'
                      : '',
                  fontWeight: 'normal',
                  fontStyle: 'italic',
                },
                {
                  label: tt('$(bold) Bold + Italic', '$(bold) 粗体 + 斜体'),
                  detail: tt('Bold + Italic', '粗体 + 斜体'),
                  description:
                    tagConfig.fontWeight === 'bold' && tagConfig.fontStyle === 'italic'
                      ? '$(check)'
                      : '',
                  fontWeight: 'bold',
                  fontStyle: 'italic',
                },
                {
                  label: tt('$(symbol-text) Normal', '$(symbol-text) 常规'),
                  detail: tt('Normal', '常规'),
                  description: !tagConfig.fontWeight && !tagConfig.fontStyle ? '$(check)' : '',
                  fontWeight: 'normal',
                  fontStyle: 'normal',
                },
              ];

              vscode.window
                .showQuickPick(fontItems, {
                  placeHolder: tt('Choose font style for ', '选择标签字体样式：') + node.tag,
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
