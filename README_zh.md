# TaskVision

[English](README.md) | 中文

TaskVision 用于在代码注释中高亮 TODO 类标签，并在活动栏树视图中集中展示。

![TaskVision 截图](resources/PixPin_2026-02-21_01-04-22.png)

> [!IMPORTANT]
> TaskVision 2.0 采用**四通道高亮模型**。旧 `type` 不再作为样式范围控制入口。

## 快速开始

把下面配置加入 `settings.json`：

```json
"taskvision.highlights.customHighlight": {
  "TODO": {
    "icon": "tasklist",
    "foreground": "#42A5F5",
    "scheme": "neon+glass",
    "colorType": "text",
    "glowType": "tag",
    "glassType": "whole-line",
    "fontType": "tag"
  },
  "FIXME": {
    "icon": "flame",
    "foreground": "#FF5252",
    "scheme": "neon+glass",
    "colorType": "text",
    "glowType": "tag",
    "glassType": "whole-line",
    "fontType": "tag"
  },
  "[ ]": {
    "icon": "issue-opened",
    "foreground": "#26C6DA",
    "scheme": "neon+glass",
    "colorType": "text",
    "glowType": "tag",
    "glassType": "whole-line",
    "fontType": "tag"
  },
  "[x]": {
    "icon": "issue-closed",
    "foreground": "#2E7D32",
    "scheme": "neon+glass",
    "colorType": "text",
    "glowType": "tag",
    "glassType": "whole-line",
    "fontType": "tag"
  },
  "[ x]": {
    "icon": "issue-closed",
    "foreground": "#2E7D32",
    "scheme": "neon+glass",
    "colorType": "text",
    "glowType": "tag",
    "glassType": "whole-line",
    "fontType": "tag"
  }
}
```

## 四通道语义

- `colorType`：控制文字染色范围。
- `glowType`：控制辉光（`text-shadow`）范围。
- `glassType`：控制玻璃背景范围。
- `fontType`：控制字体样式范围（`fontWeight`/`fontStyle`/`textDecoration`）。

可用范围枚举：

- `tag`
- `text`
- `tag-and-comment`
- `text-and-comment`
- `tag-and-subTag`
- `line`
- `whole-line`
- `none`

## scheme 语义

- `scheme: "neon"`：只启用辉光预设参数。
- `scheme: "glass"`：只启用玻璃预设参数。
- `scheme: "neon+glass"`：同时启用两者。
- `scheme` 不再决定作用范围。

## 命令面板

`TaskVision: Customize Appearance` 已支持四个独立入口：

- Set Color Scope (`colorType`)
- Set Glow Scope (`glowType`)
- Set Glass Scope (`glassType`)
- Set Font Scope (`fontType`)

有工作区时，扩展会优先把外观修改写入 **Workspace** 级配置。

## 常见问题

**Q: 命令面板改了样式，但看起来没生效？**
A: `.vscode/settings.json`（工作区配置）会覆盖全局配置。

**Q: 正文为什么会被斜体污染？**
A: 把 `fontType` 设为 `tag`，仅让标签应用字体样式。

**Q: 如何实现“整行玻璃 + 标签辉光 + 正文染色”？**
A: 使用 `glassType: "whole-line"`、`glowType: "tag"`、`colorType: "text"`。

## 安装

```bash
ext install taskvision
```
