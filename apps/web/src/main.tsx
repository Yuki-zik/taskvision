import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import '@xyflow/react/dist/style.css';
import './components/react-flow-ui/kit.css';
import './styles.css';
import './graph/graph.css';
import './graph/node-kit.css';
import './studio-theme.css';
import './studio-light.css';
import './code-source.css';
import './personal-layout.css';
import './neon-heritage.css';

// The original TaskVision identity is a dark neon/glass editor. New projects
// start with that appearance; a saved personal preference can still choose
// Light or Follow System after bootstrap without changing global VS Code UI.
document.documentElement.dataset.theme = 'dark';

const root = document.getElementById('root');
if (!root) throw new Error('无法找到工作台入口');
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
