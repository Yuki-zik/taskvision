import { ArrowUpRight, Check, FileCode2, Pencil, Archive, MessageSquareText } from 'lucide-react';
import type { Annotation, Selection } from '../domain';
import { canDecideProposal, statuses } from '../domain';
import { TagChip } from './ui';

interface Props {
  annotation: Annotation;
  onSelect: (selection: Selection) => void;
  onEdit: (annotation: Annotation) => void;
  onDecide: (annotation: Annotation, decision: 'accept' | 'archive') => void;
  compact?: boolean;
  busy?: boolean;
}
export function KnowledgeEntry({ annotation, onSelect, onEdit, onDecide, compact, busy }: Props) {
  const proposed = canDecideProposal(annotation);
  return (
    <article className={`knowledge-entry${compact ? ' compact' : ''}`}>
      <div className="entry-meta">
        <TagChip tag={annotation.tag} />
        <span>
          {annotation.origin === 'source' ? (
            <>
              <FileCode2 size={12} />
              源码注释
            </>
          ) : (
            <>
              <MessageSquareText size={12} />
              {annotation.origin === 'legacy' ? '历史知识' : '共享指导'}
            </>
          )}
        </span>
        <span
          className={`entry-status ${annotation.freshness !== 'current' || proposed ? 'attention' : ''}`}
        >
          {statuses[annotation.freshness !== 'current' ? annotation.freshness : annotation.status]}
        </span>
      </div>
      <button
        className="entry-title"
        onClick={() =>
          onSelect({ path: annotation.path, line: annotation.line, annotationId: annotation.id })
        }
      >
        {annotation.summary}
        <ArrowUpRight size={14} />
      </button>
      {!compact && annotation.body && <p className="entry-body">{annotation.body}</p>}
      <div className="entry-bottom">
        <button
          className="path-link"
          onClick={() =>
            onSelect({ path: annotation.path, line: annotation.line, annotationId: annotation.id })
          }
        >
          {annotation.path
            ? annotation.anchorKind === 'module'
              ? `模块：${annotation.path}`
              : `${annotation.path}:${annotation.line}`
            : '项目级指导'}
        </button>
        <button className="text-button" onClick={() => onEdit(annotation)}>
          <Pencil size={12} />
          {annotation.origin === 'legacy' ? '另存指导' : '编辑'}
        </button>
      </div>
      {proposed && (
        <div className="proposal-actions">
          <span>{annotation.author || 'Agent'} 的提议</span>
          <button disabled={busy} onClick={() => onDecide(annotation, 'accept')}>
            <Check size={13} />
            采纳
          </button>
          <button disabled={busy} onClick={() => onDecide(annotation, 'archive')}>
            <Archive size={13} />
            归档
          </button>
        </div>
      )}
    </article>
  );
}
