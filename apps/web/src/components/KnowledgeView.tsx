import { Plus } from 'lucide-react';
import type { Annotation, Filter, Selection, Snapshot } from '../domain';
import { matchesAnnotation } from '../domain';
import { KnowledgeEntry } from './KnowledgeEntry';
import { Empty } from './ui';

interface Props {
  snapshot: Snapshot;
  filter: Filter;
  onSelect: (selection: Selection) => void;
  onEdit: (annotation?: Annotation) => void;
  onDecide: (annotation: Annotation, decision: 'accept' | 'archive') => void;
}
export function KnowledgeView({ snapshot, filter, onSelect, onEdit, onDecide }: Props) {
  const entries = snapshot.annotations.filter((annotation) =>
    matchesAnnotation(annotation, filter),
  );
  const projectNotes = entries.filter((annotation) => !annotation.path);
  const fileNotes = entries.filter((annotation) => annotation.path);
  return (
    <section className="content-view knowledge-view">
      <div className="view-heading">
        <div>
          <h2>知识索引</h2>
          <p>开发意图、复用经验与源码事实，在同一个上下文里。</p>
        </div>
        <button className="button primary" onClick={() => onEdit()}>
          <Plus size={15} />
          添加指导
        </button>
      </div>
      {projectNotes.length > 0 && (
        <>
          <div className="section-label">
            项目级指导<span>{projectNotes.length} 条</span>
          </div>
          {projectNotes.map((annotation) => (
            <KnowledgeEntry
              key={annotation.id}
              annotation={annotation}
              onSelect={onSelect}
              onEdit={onEdit}
              onDecide={onDecide}
            />
          ))}
        </>
      )}
      {fileNotes.length > 0 && (
        <>
          <div className="section-label">
            代码知识<span>{fileNotes.length} 条</span>
          </div>
          {fileNotes.map((annotation) => (
            <KnowledgeEntry
              key={annotation.id}
              annotation={annotation}
              onSelect={onSelect}
              onEdit={onEdit}
              onDecide={onDecide}
            />
          ))}
        </>
      )}
      {!entries.length && (
        <Empty title="没有匹配的知识">
          更换搜索或标签，或添加项目指导。这里展示真实的源码注释与共享记录。
        </Empty>
      )}
    </section>
  );
}
