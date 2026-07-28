import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // SPRx base — frozen, includes the :root palette
import './styles/shell.css'; // Agent 1
import './styles/format.css'; // Agent 2 (reserved)
import './styles/editor.css'; // Agent 3
import './styles/browse.css'; // Agent 4
import './styles/inspect.css'; // UI inspector overlay (hold F2)

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>
);
