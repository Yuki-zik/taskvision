import { useEffect, useRef } from 'react';
import { ArrowRight, ArrowUpRight, X } from 'lucide-react';
import type { Selection, SourceEdge } from '../domain';
import type { KnowledgeEdge } from './model';
import { RELATION_CATEGORIES, relationCategory } from './model';
import { RELATIONS, relationPresentation } from './relations';

const SOURCE_KINDS: SourceEdge['kind'][] = [
  'runtime-import',
  'require',
  'import',
  'type-import',
  're-export',
  'dynamic-import',
  'lexical-import',
];

interface Props {
  edge: KnowledgeEdge;
  onSelect: (selection: Selection) => void;
  onClose: () => void;
}
export function RelationDetails({ edge, onSelect, onClose }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [edge.id]);
  const data = edge.data!;
  const relation = relationPresentation(data);
  const omitted = Math.max(0, data.count - data.evidence.length);
  const groups = RELATION_CATEGORIES.map((category) => {
    const evidence = data.evidence.filter((item) => relationCategory(item.kind) === category);
    const count =
      data.kindCounts?.[category] ??
      (!data.grouped && data.category === category ? data.count : evidence.length);
    return { category, evidence, count };
  }).filter((group) => group.count > 0);
  return (
    <aside
      className="relation-details nodrag nopan nowheel"
      aria-label="依赖关系证据"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <h3 ref={heading} tabIndex={-1}>
          {data.grouped && (
            <ArrowRight className="relation-summary-symbol" size={16} aria-hidden="true" />
          )}
          {relation.label}{' '}
          <span>
            {data.grouped ? `${groups.length} 类 · ` : ''}
            {data.count} 处引用
          </span>
        </h3>
        <button className="icon-button" aria-label="关闭关系证据" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="relation-direction">
        <strong>{edge.source.replace(/^(module|file):/, '')}</strong>
        <span>
          <ArrowRight size={14} /> 依赖于
        </span>
        <strong>{edge.target.replace(/^(module|file):/, '')}</strong>
      </div>
      <p className="relation-explanation">{relation.hint}。箭头由引用方指向提供方。</p>
      <div className="relation-evidence">
        {groups.map(({ category, evidence: categoryEvidence, count }) => (
          <section
            className="relation-evidence-group"
            key={category}
            aria-label={`${RELATIONS[category].label}关系证据`}
          >
            <h4>
              <svg width="23" height="12" viewBox="0 0 23 12" aria-hidden="true">
                <path
                  d="M1 6H20"
                  stroke={RELATIONS[category].color}
                  strokeWidth="1.6"
                  strokeDasharray={RELATIONS[category].dash}
                />
                <path
                  d="m17 3 4 3-4 3"
                  fill="none"
                  stroke={RELATIONS[category].color}
                  strokeWidth="1.6"
                />
              </svg>
              {RELATIONS[category].label}
              <span>{count} 处</span>
            </h4>
            {count > categoryEvidence.length && (
              <p className="relation-group-omitted">
                展示 {categoryEvidence.length} 处；另 {count - categoryEvidence.length} 处未展示
              </p>
            )}
            {SOURCE_KINDS.map((kind) => {
              if (relationCategory(kind) !== category) return null;
              const evidence = categoryEvidence.filter((item) => item.kind === kind);
              const total = data.sourceKindCounts?.[kind];
              if (!evidence.length && !total) return null;
              return (
                <div className="relation-source-kind" key={kind}>
                  <div className="relation-kind">
                    <code>{kind}</code>
                    {kind === 'import' && <span>旧版记录</span>}
                    <span>
                      {total === undefined ? `展示 ${evidence.length} 处` : `${total} 处`}
                    </span>
                  </div>
                  <ol className="relation-evidence-list">
                    {evidence.map((item, index) => (
                      <li key={`${item.from}:${item.line ?? 'unknown'}:${index}`}>
                        <button
                          className="evidence-source"
                          onClick={() => onSelect({ path: item.from, line: item.line ?? 1 })}
                        >
                          <span>
                            {item.from}
                            {item.line ? `:${item.line}` : ''}
                          </span>
                          <ArrowUpRight size={14} />
                        </button>
                        {!item.line && <small>未记录行号 · 打开源文件</small>}
                        <div className="evidence-target">
                          <ArrowRight size={12} />
                          <span>{item.to}</span>
                        </div>
                        <div className="evidence-specifier">
                          引用 <code>{item.specifier ?? '未记录 specifier'}</code>
                        </div>
                        <small className="evidence-provenance">证据来源：{item.provenance}</small>
                      </li>
                    ))}
                  </ol>
                  {total !== undefined && total > evidence.length && (
                    <p className="relation-kind-omitted">
                      {kind}：展示 {evidence.length} 处；另 {total - evidence.length} 处未展示
                    </p>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
      {omitted > 0 && (
        <p className="evidence-omitted">
          共 {data.count} 处，展示 {data.evidence.length} 处；另 {omitted} 处未展示。
        </p>
      )}
    </aside>
  );
}
