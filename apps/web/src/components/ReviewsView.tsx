import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  FileDiff,
  GitCompareArrows,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import type { Review, ReviewDetail, ReviewFile, Selection, Snapshot } from '../domain';
import { formatTime, statuses } from '../domain';
import { useDraft } from '../hooks/useDraft';
import { api, errorMessage, type Mutate } from '../services/api';
import { diffLines } from '../services/diff';
import { Empty, Loading, Notice } from './ui';

function FileDifference({
  file,
  onSelect,
}: {
  file: ReviewFile;
  onSelect: (selection: Selection) => void;
}) {
  const lines = useMemo(() => diffLines(file.before, file.after), [file.before, file.after]);
  const added = lines.filter((line) => line.type === 'add').length;
  const removed = lines.filter((line) => line.type === 'remove').length;
  return (
    <div className="file-difference">
      <div className="diff-file-heading">
        <button onClick={() => onSelect({ path: file.path, line: 1 })}>
          <FileDiff size={15} />
          {file.path}
          <ArrowUpRight size={13} />
        </button>
        <span>
          <b className="diff-added">+{added}</b>
          <b className="diff-removed">−{removed}</b>
        </span>
      </div>
      {file.truncated && (
        <Notice>服务端限制了此文件的差异长度，请在本地进一步检查完整文件。</Notice>
      )}
      <div className="diff-hashes">
        <span>之前 {file.beforeHash?.slice(0, 10) ?? '不存在'}</span>
        <ChevronRight size={12} />
        <span>之后 {file.afterHash?.slice(0, 10) ?? '已删除'}</span>
      </div>
      {file.status === 'unchanged' ? (
        <div className="unchanged-file">此文件在任务范围内，内容未变化。</div>
      ) : (
        <div className="diff-code" role="region" aria-label={`${file.path} 文件差异`} tabIndex={0}>
          {lines.slice(0, 4000).map((line, index) => (
            <div className={`diff-line diff-${line.type}`} key={index}>
              <span>{line.oldLine ?? ''}</span>
              <span>{line.newLine ?? ''}</span>
              <b>{line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}</b>
              <code>{line.text || ' '}</code>
            </div>
          ))}
          {lines.length > 4000 && (
            <Notice>当前显示前 4000 行差异，请在本地检查完整文件后决定。</Notice>
          )}
        </div>
      )}
    </div>
  );
}
interface DetailProps {
  review: Review;
  snapshot: Snapshot;
  mutate: Mutate;
  onSelect: (selection: Selection) => void;
  onSaved: () => void;
}
function ReviewInspector({ review, snapshot, mutate, onSelect, onSaved }: DetailProps) {
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [fileIndex, setFileIndex] = useState(0);
  const { draft, setDraft, clear, storageError } = useDraft(
    `taskvision:${snapshot.project.workspaceId}:review:${review.id}`,
    '',
  );
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void api
      .review(review.id, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setDetail(result);
          setError('');
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [review.id, snapshot.revision, snapshot.project.head, snapshot.project.workspaceId, reload]);
  async function decide(decision: 'accepted' | 'changes-requested') {
    setBusy(true);
    setError('');
    try {
      await mutate('review_resolve', { reviewId: review.id, decision, note: draft });
      clear();
      onSaved();
    } catch (failure) {
      setError(errorMessage(failure));
      setReload((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }
  const file = detail?.files[fileIndex] ?? detail?.files[0];
  const task = snapshot.tasks.find((task) => task.id === review.taskId);
  return (
    <article className="review-detail">
      <div className="review-title">
        <span className={`review-state review-state-${review.status}`}>
          <ShieldCheck size={14} />
          {statuses[review.status]}
        </span>
        <h3>{task?.title ?? review.taskId}</h3>
        <p>{review.summary}</p>
        <div className="review-metadata">
          <span>{formatTime(review.createdAt)}</span>
          <code>{review.head.slice(0, 8) || '无 Git 提交'}</code>
          <span title={review.workspaceId}>工作区 {review.workspaceId.slice(0, 12)}</span>
        </div>
      </div>
      {error && (
        <Notice danger>
          {error}
          <button className="text-button" onClick={() => setReload((value) => value + 1)}>
            重新读取
          </button>
        </Notice>
      )}
      {detail?.warning && <Notice>{detail.warning}</Notice>}
      {detail?.stale && (
        <Notice danger>源码或工作区指纹已变化。此交付不能通过验收，请要求 Agent 重新提交。</Notice>
      )}
      {detail && !detail.baselineAvailable && (
        <Notice>这是一条没有历史基线的记录，无法展示可信的前后差异。请要求重新提交。</Notice>
      )}
      <details className="review-evidence">
        <summary className="section-label">
          提交证据 · {review.evidence.length} 条<span>展开核查 · 由 Agent 报告</span>
        </summary>
        {review.evidence.length ? (
          <ul>
            {review.evidence.map((evidence, index) => (
              <li key={index}>
                <Check size={13} />
                <pre>{evidence}</pre>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">未提供测试或验证证据。</p>
        )}
      </details>
      <div className="section-label">
        实际文件差异<span>{detail?.files.length ?? review.paths.length} 个范围内文件</span>
      </div>
      {loading && !detail ? (
        <Loading>正在读取原始版本与当前源码…</Loading>
      ) : (
        detail && (
          <>
            {detail.files.length > 1 && (
              <div className="diff-file-tabs" role="tablist" aria-label="差异文件">
                {detail.files.map((item, index) => (
                  <button
                    key={item.path}
                    role="tab"
                    aria-selected={item.path === file?.path}
                    onClick={() => setFileIndex(index)}
                  >
                    {item.path}
                    <span>
                      {
                        (
                          {
                            modified: '修改',
                            added: '新增',
                            deleted: '删除',
                            unchanged: '未变',
                          } as const
                        )[item.status]
                      }
                    </span>
                  </button>
                ))}
              </div>
            )}
            {file ? (
              <FileDifference file={file} onSelect={onSelect} />
            ) : (
              <Empty title="没有可展示的文件差异">请检查交付范围与服务端基线记录。</Empty>
            )}
          </>
        )
      )}
      {review.status === 'pending' ? (
        <section className="human-decision">
          <h4>
            <ShieldCheck size={17} />
            人工决定
          </h4>
          <p>决定绑定当前源码版本。请检查差异与证据，再提交你的意见。</p>
          {storageError && <Notice danger>无法持久保存审阅草稿，请在关闭前复制意见。</Notice>}
          <label>
            审阅意见
            <textarea
              rows={3}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="记录已检查的要点，或明确需要修改的内容"
            />
          </label>
          <div className="form-actions">
            <button
              className="button primary"
              disabled={
                busy || loading || !detail || detail.stale || !detail.baselineAvailable || !!error
              }
              onClick={() => {
                void decide('accepted');
              }}
            >
              {busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}人工验收通过
            </button>
            <button
              className="button"
              disabled={busy || !detail}
              onClick={() => {
                void decide('changes-requested');
              }}
            >
              <RotateCcw size={14} />
              要求修改
            </button>
          </div>
        </section>
      ) : (
        <section className="resolved-review">
          <ShieldCheck size={18} />
          <div>
            <strong>{statuses[review.status]}</strong>
            {review.note && <p>{review.note}</p>}
            <small>
              {review.reviewedBy} · {review.reviewedAt ? formatTime(review.reviewedAt) : ''}
            </small>
          </div>
        </section>
      )}
    </article>
  );
}
interface Props {
  snapshot: Snapshot;
  query: string;
  mutate: Mutate;
  onSelect: (selection: Selection) => void;
  onSaved: () => void;
}
export function ReviewsView({ snapshot, query, mutate, onSelect, onSaved }: Props) {
  const reviews = useMemo(
    () =>
      snapshot.reviews
        .filter((review) =>
          `${review.summary} ${review.paths.join(' ')} ${snapshot.tasks.find((task) => task.id === review.taskId)?.title ?? ''}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
        .sort(
          (a, b) =>
            Number(b.workspaceId === snapshot.project.workspaceId) -
              Number(a.workspaceId === snapshot.project.workspaceId) ||
            Number(b.status === 'pending') - Number(a.status === 'pending') ||
            b.createdAt.localeCompare(a.createdAt),
        ),
    [snapshot, query],
  );
  const [selectedId, setSelectedId] = useState('');
  const selected = reviews.find((review) => review.id === selectedId) ?? reviews[0];
  return (
    <section className="content-view reviews-view">
      <div className="view-heading">
        <div>
          <h2>人工审阅</h2>
          <p>用真实代码差异与证据，判断每一次交付。</p>
        </div>
        <GitCompareArrows size={23} strokeWidth={1.4} />
      </div>
      {reviews.length ? (
        <>
          <div className="review-switcher" aria-label="审阅交付">
            {reviews.map((review) => (
              <button
                key={review.id}
                className={selected?.id === review.id ? 'selected' : ''}
                onClick={() => setSelectedId(review.id)}
              >
                <span
                  className={`status-dot ${review.status === 'pending' ? 'status-review' : 'status-done'}`}
                />
                <span>
                  {snapshot.tasks.find((task) => task.id === review.taskId)?.title ??
                    review.summary}
                </span>
                <small>
                  {review.workspaceId !== snapshot.project.workspaceId
                    ? '其他工作区'
                    : statuses[review.status]}
                </small>
              </button>
            ))}
          </div>
          {selected && (
            <ReviewInspector
              key={selected.id}
              review={selected}
              snapshot={snapshot}
              mutate={mutate}
              onSelect={onSelect}
              onSaved={onSaved}
            />
          )}
        </>
      ) : (
        <Empty title="当前没有审阅交付">
          Agent 提交任务结果后，在这里查看原始版本、实际改动与测试证据，并作出人工决定。
        </Empty>
      )}
    </section>
  );
}
