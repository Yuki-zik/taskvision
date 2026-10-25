import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AlertCircle, Inbox, LoaderCircle, X } from 'lucide-react';
import type { Tag } from '../domain';

export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" className="icon-button" title={label} aria-label={label} {...props}>
      {children}
    </button>
  );
}
export function TagChip({ tag, count }: { tag: Tag; count?: number }) {
  return (
    <span className={`tag-chip tag-${tag.toLowerCase()}`}>
      {tag}
      {count !== undefined && <b>{count}</b>}
    </span>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <Inbox size={27} strokeWidth={1.3} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Notice({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  return (
    <div className={`notice${danger ? ' danger' : ''}`} role={danger ? 'alert' : 'status'}>
      <AlertCircle size={16} />
      <div>{children}</div>
    </div>
  );
}
export function Loading({ children = '正在读取项目…' }: { children?: ReactNode }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={21} />
      {children}
    </div>
  );
}
export function PanelHeading({
  title,
  children,
  onClose,
}: {
  title: string;
  children?: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="panel-heading">
      <h2>{title}</h2>
      <div className="heading-actions">
        {children}
        {onClose && (
          <IconButton label="关闭面板" onClick={onClose}>
            <X size={18} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
