import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('TaskVision workbench render failed', error, info.componentStack);
  }
  override render() {
    if (this.state.failed)
      return (
        <main className="connection-empty" role="alert">
          <h2>工作台暂时无法显示</h2>
          <p>请重新载入页面。已保存到浏览器的编辑草稿会保留。</p>
          <button className="button primary" onClick={() => window.location.reload()}>
            <RefreshCw size={15} />
            重新载入
          </button>
        </main>
      );
    return this.props.children;
  }
}
