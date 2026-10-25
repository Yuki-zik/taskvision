import { useState, type ChangeEvent } from 'react';
import { Check, Download, FileJson, LoaderCircle, ScanSearch, Upload } from 'lucide-react';
import type { OperationResult, Snapshot } from '../domain';
import { errorMessage, type Mutate } from '../services/api';
import { Notice, PanelHeading } from './ui';

export function TransferPanel({
  snapshot,
  mutate,
  onClose,
  onSaved,
}: {
  snapshot: Snapshot;
  mutate: Mutate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [document, setDocument] = useState<unknown>();
  const [filename, setFilename] = useState('');
  const [preview, setPreview] = useState<OperationResult<'knowledge_import'> | null>(null);
  const [previewRevision, setPreviewRevision] = useState(-1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  async function read(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview(null);
    setDocument(undefined);
    setError('');
    setComplete(false);
    if (!file) {
      setFilename('');
      return;
    }
    setFilename(file.name);
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error('文件超过 2 MiB，请缩小知识导入文件后重试。');
      const value: unknown = JSON.parse(await file.text());
      if (typeof value !== 'object' || value === null)
        throw new Error('请选择有效的 TaskVision JSON 导出文件。');
      if (
        new Blob([
          JSON.stringify({
            operation: 'knowledge_import',
            args: { document: value, dryRun: true },
          }),
        ]).size >
        2 * 1024 * 1024
      )
        throw new Error('导入请求超过 2 MiB，请缩小知识档案后重试。');
      setDocument(value);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }
  async function run(dryRun: boolean) {
    setBusy(true);
    setError('');
    try {
      const result = await mutate('knowledge_import', { document, dryRun });
      setPreview(result);
      setPreviewRevision(snapshot.revision);
      if (!dryRun) {
        setComplete(true);
        onSaved();
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  const stale = previewRevision !== snapshot.revision;
  return (
    <aside className="editor-pane transfer-pane">
      <PanelHeading title="知识导入与导出" onClose={onClose} />
      <div className="editor-form">
        <section className="transfer-section">
          <Download size={22} strokeWidth={1.5} />
          <h3>导出项目知识</h3>
          <p>保存注释、任务和审阅记录，作为可携带的知识档案。</p>
          <a className="button" href="/api/export" download>
            <Download size={14} />
            下载 JSON
          </a>
        </section>
        <section className="transfer-section">
          <Upload size={22} strokeWidth={1.5} />
          <h3>导入知识档案</h3>
          <p>先检查记录与冲突，确认预览后才会写入。租约和批准身份不会随档案恢复。</p>
          <label className="import-file">
            <FileJson size={18} />
            <span>{filename || '选择 TaskVision JSON 文件（最多 2 MiB）'}</span>
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                void read(event);
              }}
            />
          </label>
          {error && <Notice danger>{error}</Notice>}
          {document !== undefined && !complete && (
            <button
              className="button"
              disabled={busy}
              onClick={() => {
                void run(true);
              }}
            >
              {busy ? <LoaderCircle size={14} className="spin" /> : <ScanSearch size={14} />}
              预检与冲突预览
            </button>
          )}
          {preview && (
            <div className="import-preview">
              <h4>{complete ? '导入结果' : '预检结果'}</h4>
              <dl>
                <div>
                  <dt>{complete ? '已导入' : '可导入'}</dt>
                  <dd>{preview.imported}</dd>
                </div>
                <div>
                  <dt>重复 / 跳过</dt>
                  <dd>{preview.skipped}</dd>
                </div>
                <div>
                  <dt>冲突</dt>
                  <dd>{preview.conflicts.length}</dd>
                </div>
              </dl>
              {preview.conflicts.length > 0 && (
                <Notice>
                  以下记录冲突，服务将保留当前内容：
                  <ul>
                    {preview.conflicts.map((conflict, index) => (
                      <li key={index}>{conflict}</li>
                    ))}
                  </ul>
                </Notice>
              )}
              {!complete && stale && <Notice>项目在预检后已变化，请重新预检。</Notice>}
              {complete ? (
                <p className="success-message">
                  <Check size={15} />
                  已完成导入，当前知识已刷新。
                </p>
              ) : (
                <button
                  className="button primary"
                  disabled={busy || stale || !preview.dryRun || preview.imported === 0}
                  onClick={() => {
                    void run(false);
                  }}
                >
                  <Upload size={14} />
                  确认导入 {preview.imported} 条记录
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
