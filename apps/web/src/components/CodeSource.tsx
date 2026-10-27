import React, { useEffect, useRef, useState } from 'react';
import type { Annotation } from '../domain';
import {
  highlightSource,
  plainSource,
  type HighlightedSource,
  type SourceHighlightSettings,
  type SourceTheme,
} from '../services/sourceHighlight';

interface Props {
  text: string;
  path: string;
  selectedLine?: number;
  annotations: Annotation[];
  theme?: SourceTheme;
  highlightSettings?: SourceHighlightSettings;
  onSelect: (line: number) => void;
  onKnowledge: () => void;
}
interface RenderedSource {
  text: string;
  path: string;
  theme: SourceTheme;
  settings?: SourceHighlightSettings;
  result: HighlightedSource;
}

export function CodeSource({
  text,
  path,
  selectedLine,
  annotations,
  theme = 'dark',
  highlightSettings,
  onSelect,
  onKnowledge,
}: Props) {
  const [rendered, setRendered] = useState<RenderedSource | null>(null);
  const selected = useRef<HTMLDivElement>(null);
  // Never display tokens from a different file/project or the previous theme while loading.
  const source =
    rendered?.text === text &&
    rendered.path === path &&
    rendered.theme === theme &&
    rendered.settings === highlightSettings
      ? rendered.result
      : plainSource(text, theme);
  useEffect(() => {
    let cancelled = false;
    void highlightSource(text, path, theme, highlightSettings).then((result) => {
      if (!cancelled) setRendered({ text, path, theme, settings: highlightSettings, result });
    });
    return () => {
      cancelled = true;
    };
  }, [text, path, theme, highlightSettings]);
  useEffect(() => {
    selected.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [text, path, selectedLine, rendered]);
  return (
    <React.Fragment>
      <div className="source-rendering-note">
        <span>
          {source.mode === 'textmate'
            ? `TextMate · ${source.language} · ${theme === 'dark' ? 'Dark+' : 'Light+'}${source.reason ? ` · ${source.reason}` : ''}`
            : source.reason}
        </span>
        <span>
          {highlightSettings ? '已载入 VS Code 高亮设置' : 'TaskVision package.json 默认高亮'}。使用
          VS Code 兼容 TextMate 主题；浅色模式会压暗低对比度标签文字，自定义 ThemeColor
          无法保证像素一致。
        </span>
      </div>
      <div
        className="source-code tv-code-source"
        data-source-theme={theme}
        data-syntax-mode={source.mode}
        role="region"
        aria-label={`${path} 源码`}
        tabIndex={0}
        style={{ backgroundColor: source.background, color: source.foreground }}
      >
        {source.lines.map((line, index) => {
          const number = index + 1;
          const tags = annotations.filter((a) => a.line <= number && a.endLine >= number);
          return (
            <div
              key={number}
              ref={number === selectedLine ? selected : undefined}
              data-line={number}
              className={`source-line${number === selectedLine ? ' selected-line' : ''}${tags.length ? ' annotated-line' : ''}`}
              style={line.style}
            >
              <button
                className="line-number"
                title={`为第 ${number} 行添加指导`}
                aria-label={`选择第 ${number} 行`}
                aria-current={number === selectedLine ? 'location' : undefined}
                onClick={() => onSelect(number)}
              >
                {number}
              </button>
              <code>
                {line.tokens.map((token, i) => (
                  <span
                    key={i}
                    className={token.tag ? 'tv-source-tag' : undefined}
                    data-taskvision-tag={token.tag}
                    style={token.style}
                  >
                    {token.text}
                  </span>
                ))}
              </code>
              {tags.length > 0 && (
                <button
                  className="source-annotation-dot"
                  title={tags.map((a) => a.summary).join('\n')}
                  aria-label={`查看第 ${number} 行知识`}
                  onClick={onKnowledge}
                >
                  {tags.length > 1 ? tags.length : <span />}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </React.Fragment>
  );
}
