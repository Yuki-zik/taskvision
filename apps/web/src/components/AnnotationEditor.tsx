import { useEffect, useState, type FormEvent } from 'react';
import { Check, LoaderCircle, Save, X } from 'lucide-react';
import { TAGS, type Annotation, type Snapshot, type Tag } from '../domain';
import { useDraft } from '../hooks/useDraft';
import { api, errorMessage, type Mutate } from '../services/api';
import { IconButton, Notice, PanelHeading, TagChip } from './ui';

export interface EditorTarget {
  annotation?: Annotation;
  path: string;
  line: number;
}
interface NoteDraft {
  tag: Tag;
  summary: string;
  body: string;
  path: string;
  line: number;
  baseRevision?: number;
  baseHash: string | null;
}
interface Props {
  target: EditorTarget;
  snapshot: Snapshot;
  mutate: Mutate;
  onClose: () => void;
  onSaved: () => void;
}

export function AnnotationEditor({ target, snapshot, mutate, onClose, onSaved }: Props) {
  const annotation = target.annotation;
  const source = annotation?.origin === 'source';
  const existing = annotation && annotation.origin !== 'legacy';
  const latest = snapshot.annotations.find((item) => item.id === annotation?.id);
  const namespace = `taskvision:${snapshot.project.workspaceId}:note:`;
  // New notes are anchored to both file and line; old drafts lacked the line.
  const key = namespace + (existing ? annotation.id : `new:${target.path}:${target.line}`);
  const legacy = existing
    ? undefined
    : {
        key: namespace + `new:${target.path}`,
        accepts: (value: unknown): value is NoteDraft =>
          typeof value === 'object' &&
          value !== null &&
          'path' in value &&
          value.path === target.path &&
          'line' in value &&
          value.line === target.line &&
          'tag' in value &&
          TAGS.includes(value.tag as Tag) &&
          'summary' in value &&
          typeof value.summary === 'string' &&
          'body' in value &&
          typeof value.body === 'string' &&
          'baseHash' in value &&
          (value.baseHash === null || typeof value.baseHash === 'string'),
      };
  const { draft, setDraft, clear, storageError } = useDraft<NoteDraft>(
    key,
    {
      tag: annotation?.tag ?? 'INTENT',
      summary: annotation?.summary ?? '',
      body: annotation?.body ?? '',
      path: target.path,
      line: target.line,
      baseRevision: existing ? annotation.revision : undefined,
      baseHash: annotation?.fileHash ?? null,
    },
    legacy,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const changed =
    !!latest &&
    (source ? latest.fileHash !== draft.baseHash : latest.revision !== draft.baseRevision);
  const update = <K extends keyof NoteDraft>(field: K, value: NoteDraft[K]) =>
    setDraft((current) => ({ ...current, [field]: value }));
  useEffect(() => {
    if (!source || draft.baseHash) return;
    const controller = new AbortController();
    void api
      .source(target.path, controller.signal)
      .then((result) => {
        setDraft((current) => ({ ...current, baseHash: current.baseHash ?? result.hash }));
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      });
    return () => controller.abort();
  }, [source, draft.baseHash, target.path, setDraft]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (draft.summary.trim().length > 2000 || (!source && draft.body.length > 16000))
        throw new Error('摘要最多 2000 字，详细说明最多 16000 字。现有草稿已保留，请缩短后保存。');
      if (source && annotation) {
        if (!draft.baseHash) throw new Error('尚未读取源码版本，请稍后再试。');
        await mutate('edit_source_annotation', {
          id: annotation.id,
          summary: draft.summary.trim(),
          expectedHash: draft.baseHash,
        });
      } else
        await mutate('annotation_upsert', {
          ...(existing ? { id: annotation.id, expectedRevision: draft.baseRevision } : {}),
          tag: draft.tag,
          summary: draft.summary.trim(),
          body: draft.body,
          path: draft.path.trim(),
          line: draft.path.trim() ? draft.line : 1,
        });
      clear();
      setSaved(true);
      onSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  async function rebase() {
    if (!latest) return;
    setBusy(true);
    try {
      const hash = source ? (await api.source(target.path)).hash : null;
      setDraft((current) => ({ ...current, baseRevision: latest.revision, baseHash: hash }));
      setError('');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="editor-pane" aria-label={source ? '编辑源码注释' : '编辑共享指导'}>
      <PanelHeading
        title={source ? '编辑源码注释' : existing ? '编辑共享指导' : '添加指导'}
        onClose={onClose}
      />
      {saved ? (
        <div className="editor-saved">
          <Check size={28} />
          <h3>已保存</h3>
          <p>知识已同步至项目，Agent 的后续查询可读取。</p>
          <button className="button primary" onClick={onClose}>
            返回工作台
          </button>
        </div>
      ) : (
        <form
          className="editor-form"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <p className="form-intro">
            {source
              ? '只修改这条源码注释的内容，保留标签、锚点和文件其余代码。'
              : '把意图、约束与复用入口留给协作者。指导随项目上下文提供给 Agent。'}
          </p>
          {storageError && (
            <Notice danger>浏览器无法保存草稿。当前内容仍保留在面板，请保存后再关闭。</Notice>
          )}
          {changed && (
            <Notice>
              此内容已被其他窗口修改。你的草稿与原版本仍保留。
              <details>
                <summary>对照最新内容</summary>
                <p>{latest?.summary}</p>
                <p>{latest?.body}</p>
              </details>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  void rebase();
                }}
                disabled={busy}
              >
                已比较，基于最新版本保留本草稿
              </button>
            </Notice>
          )}
          {error && <Notice danger>{error} 草稿未丢失。</Notice>}
          <label>
            语义标签
            <select
              value={draft.tag}
              disabled={source}
              onChange={(event) => update('tag', event.target.value as Tag)}
            >
              {TAGS.map((tag) => (
                <option key={tag} value={tag}>
                  {tag} ·{' '}
                  {
                    (
                      {
                        INTENT: '开发意图',
                        CORE: '核心逻辑',
                        REUSE: '复用入口',
                        REVIEW: '审阅要点',
                        TODO: '待办',
                      } as const
                    )[tag]
                  }
                </option>
              ))}
            </select>
          </label>
          <label>
            {source ? '注释内容' : '指导摘要'}
            <textarea
              aria-label={source ? '注释内容' : '指导摘要'}
              autoFocus
              required
              rows={3}
              maxLength={2000}
              value={draft.summary}
              onChange={(event) => update('summary', event.target.value)}
              placeholder="例如：改动鉴权前先复用现有的权限校验入口"
            />
            <span className="field-help">{draft.summary.length} / 2000</span>
          </label>
          {!source && (
            <>
              <label>
                详细说明
                <textarea
                  aria-label="详细说明"
                  rows={7}
                  maxLength={16000}
                  value={draft.body}
                  onChange={(event) => update('body', event.target.value)}
                  placeholder="补充设计理由、复用路径或需要人工确认的边界…"
                />
                <span className="field-help">{draft.body.length} / 16000</span>
              </label>
              <label>
                作用范围
                <input
                  aria-label="作用范围"
                  value={draft.path}
                  list="project-source-paths"
                  onChange={(event) => update('path', event.target.value)}
                  placeholder="留空为整个项目，或填写模块／文件路径"
                />
                <span className="field-help">
                  留空：项目级指导。目录：模块级指导；文件：代码锚点。
                </span>
              </label>
              {draft.path && (
                <label>
                  锚点行号
                  <input
                    type="number"
                    required
                    min={1}
                    step={1}
                    value={draft.line}
                    onChange={(event) => update('line', Number(event.target.value))}
                  />
                </label>
              )}
            </>
          )}
          <div className="revision-note">
            <TagChip tag={draft.tag} />
            <span>
              {source
                ? `源码指纹 ${draft.baseHash?.slice(0, 12) ?? '读取中…'}`
                : existing
                  ? `基于修订 r${draft.baseRevision}`
                  : '新建 · 人类指导'}
            </span>
          </div>
          <div className="form-actions">
            <button
              className="button primary"
              type="submit"
              disabled={busy || !draft.summary.trim() || (source && !draft.baseHash)}
            >
              {busy ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}保存
              {source ? '注释' : '指导'}
            </button>
            <button className="button" type="button" onClick={onClose}>
              保留草稿并关闭
            </button>
            <IconButton
              label="清除此草稿"
              onClick={() => {
                clear();
                onClose();
              }}
            >
              <X size={15} />
            </IconButton>
          </div>
        </form>
      )}
    </aside>
  );
}
