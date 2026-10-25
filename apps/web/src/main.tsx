import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import '@xyflow/react/dist/style.css';
import './styles.css';
import './graph/graph.css';

const root = document.getElementById('root');
if (!root) throw new Error('无法找到工作台入口');
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
