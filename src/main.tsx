import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './i18n'; // Picks the locale and initialises i18next before the first render
import './index.css'; // SPRx base — frozen, includes the :root palette
import './styles/shell.css'; // App shell: titlebar, landing, workspace layout
import './styles/editor.css'; // The editor sections and field controls
import './styles/browse.css'; // Monster list, thing browsers, preview, lints
import './styles/inspect.css'; // UI inspector overlay (hold F2)
import './styles/theme.css'; // Light-mode palette override (data-theme on <html>)

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>
);
