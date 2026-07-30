import { useCallback, useEffect, useState } from 'react';
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { confirm } from '@tauri-apps/plugin-dialog';
import { AlertCircle, CheckCircle2, Minus, Moon, Square, Sun, X } from 'lucide-react';
import {
	closeWorkspace,
	listMonsters,
	openWorkspace,
	setProtocolCacheKey,
	type MonsterSummary,
	type WorkspaceInfo,
	type WorkspacePaths
} from './monster';
import { openDat, openSpr } from './spr';
import { loadSetting, loadWorkspaces, saveSetting, saveWorkspace, type RecentWorkspace } from './settings';
import Landing from './Landing';
import Workspace from './Workspace';
import UiInspector from './UiInspector';

export interface Toast {
	kind: 'ok' | 'error';
	msg: string;
}

/** "…/Ironcore/data/monster" → "Ironcore". Falls back to the folder itself. */
export function workspaceLabel(monstersPath: string): string {
	const parts = monstersPath.split(/[\\/]/).filter(Boolean);
	return parts[parts.length - 3] ?? parts[parts.length - 1] ?? monstersPath;
}

export default function App() {
	const [info, setInfo] = useState<WorkspaceInfo | null>(null);
	const [monsters, setMonsters] = useState<MonsterSummary[]>([]);
	const [openFile, setOpenFile] = useState<string | null>(null);
	const [dirty, setDirty] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [opening, setOpening] = useState(false);
	const [droppedPath, setDroppedPath] = useState<string | null>(null);
	const [recent, setRecent] = useState<RecentWorkspace[]>(loadWorkspaces);
	const [theme, setTheme] = useState<'dark' | 'light'>(() =>
		loadSetting('monx.theme', 'dark') === 'light' ? 'light' : 'dark'
	);

	// The stylesheet keys the light palette off <html data-theme="light">.
	useEffect(() => {
		document.documentElement.dataset.theme = theme;
		saveSetting('monx.theme', theme);
	}, [theme]);
	const [toast, setToast] = useState<Toast | null>(null);

	const showToast = useCallback((kind: Toast['kind'], msg: string) => {
		setToast({ kind, msg });
	}, []);

	useEffect(() => {
		if (!toast) return;
		const t = setTimeout(() => setToast(null), 3500);
		return () => clearTimeout(t);
	}, [toast]);

	const open = useCallback(
		async (paths: WorkspacePaths) => {
			setOpening(true);
			setError(null);
			try {
				const loaded = await openWorkspace(paths);
				// Bump the protocol cache-buster so images can't leak across
				// workspaces, then take frontend handles on the client files —
				// the managers already hold them, this just names them for the
				// inherited SPRx URL builders.
				setProtocolCacheKey(Date.now());
				await Promise.all([
					openSpr(loaded.sprPath).catch(() => null),
					openDat(loaded.datPath).catch(() => null)
				]);
				setInfo(loaded);
				setMonsters(await listMonsters());
				setDirty(false);
				setRecent(
					saveWorkspace({ label: workspaceLabel(loaded.paths.monsters), paths: loaded.paths })
				);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				setOpening(false);
			}
		},
		[]
	);

	const close = useCallback(async () => {
		if (dirty && !(await confirm('You have unsaved changes. Close the workspace anyway?'))) return;
		await closeWorkspace().catch(() => {});
		setInfo(null);
		setMonsters([]);
		setOpenFile(null);
		setDirty(false);
	}, [dirty]);

	const refreshMonsters = useCallback((focusFile: string | null) => {
		listMonsters()
			.then(list => {
				setMonsters(list);
				if (focusFile) setOpenFile(focusFile);
			})
			.catch(() => {});
	}, []);

	// Folder drops. Tauri gives us paths only — no coordinates — so Landing
	// decides which slot a drop belongs to from the pointer position.
	useEffect(() => {
		const un = getCurrentWebview().onDragDropEvent(event => {
			const payload = event.payload;
			if (payload.type === 'drop' && payload.paths.length > 0) {
				setDroppedPath(payload.paths[0]);
				// Clear so dropping the same folder twice re-triggers the effect.
				setTimeout(() => setDroppedPath(null), 0);
			}
		});
		return () => {
			void un.then(f => f());
		};
	}, []);

	// Closing the workspace is a command now, bound in the hotkey manager and
	// dispatched by the shell — App no longer keeps a listener of its own.

	// Remember the window's size and position across launches — restored once at
	// startup, saved (debounced) on every resize/move. tauri.conf.json's size
	// stays the first-run default.
	useEffect(() => {
		const win = getCurrentWindow();
		let timer: number | undefined;
		let restoring = true;
		(async () => {
			try {
				const raw = loadSetting('monx.window', null);
				if (raw) {
					const s = JSON.parse(raw);
					if (s.maximized) {
						await win.maximize();
					} else if (s.w >= 500 && s.h >= 400) {
						await win.setSize(new PhysicalSize(s.w, s.h));
						if (Number.isFinite(s.x) && Number.isFinite(s.y)) {
							await win.setPosition(new PhysicalPosition(s.x, s.y));
						}
					}
				}
			} catch {
				// A bad or stale value just means the default size.
			} finally {
				restoring = false;
			}
		})();
		const save = async () => {
			if (restoring) return;
			try {
				if (await win.isMaximized()) {
					saveSetting('monx.window', JSON.stringify({ maximized: true }));
					return;
				}
				const size = await win.innerSize();
				const pos = await win.outerPosition();
				saveSetting('monx.window', JSON.stringify({ w: size.width, h: size.height, x: pos.x, y: pos.y }));
			} catch {
				// Non-critical.
			}
		};
		const debounced = () => {
			clearTimeout(timer);
			timer = window.setTimeout(() => void save(), 400);
		};
		const unResized = win.onResized(debounced);
		const unMoved = win.onMoved(debounced);
		return () => {
			clearTimeout(timer);
			unResized.then(f => f()).catch(() => {});
			unMoved.then(f => f()).catch(() => {});
		};
	}, []);

	// Never let the window close on unsaved work.
	useEffect(() => {
		const un = getCurrentWindow().onCloseRequested(async event => {
			if (dirty && !(await confirm('You have unsaved changes. Quit anyway?'))) {
				event.preventDefault();
			}
		});
		return () => {
			void un.then(f => f());
		};
	}, [dirty]);

	const win = getCurrentWindow();
	const title = info
		? `${workspaceLabel(info.paths.monsters)}${openFile ? ` · ${openFile}` : ''}`
		: '';

	return (
		<div className="ss-app">
			<div className="ss-titlebar" data-tauri-drag-region>
				<div className="ss-titlebar-title">
					<img src="/icon.png" alt="" className="ss-titlebar-icon" width={14} height={14} />
					<span>MONx</span>
					{info && (
						<span className="ss-titlebar-file">
							— {title}
							{dirty && <span className="mx-dirty" title="Unsaved changes"> •</span>}
						</span>
					)}
					{/* Which engine's rules are in force. Editing one server's corpus
					    under another's rules is the failure this whole feature exists
					    to prevent, so it should never take a click to find out. */}
					{info && (
						<span
							className="mx-engine-badge"
							title={`Editing under ${info.engineLabel} rules${
								info.engineDetection.confident ? '' : ' — detection was not confident'
							}`}
							data-weak={info.engineDetection.confident ? undefined : 'true'}
						>
							{info.engineLabel}
						</span>
					)}
				</div>
				<div className="ss-titlebar-spacer" data-tauri-drag-region />
				<button
					className="ss-caption-button"
					onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
					title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
					aria-label="Toggle theme"
				>
					{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
				</button>
				<button className="ss-caption-button" onClick={() => void win.minimize()} aria-label="Minimize">
					<Minus size={14} />
				</button>
				<button className="ss-caption-button" onClick={() => void win.toggleMaximize()} aria-label="Maximize">
					<Square size={11} />
				</button>
				<button className="ss-caption-button ss-caption-close" onClick={() => void win.close()} aria-label="Close">
					<X size={14} />
				</button>
			</div>

			{info ? (
				<Workspace
					info={info}
					monsters={monsters}
					onMonstersChanged={refreshMonsters}
					dirty={dirty}
					onDirtyChange={setDirty}
					onOpenFile={setOpenFile}
					showToast={showToast}
					onCloseWorkspace={() => void close()}
				/>
			) : (
				<Landing
					error={error}
					opening={opening}
					droppedPath={droppedPath}
					recent={recent}
					onOpen={paths => void open(paths)}
					onOpenRecent={entry => void open(entry.paths)}
				/>
			)}

			<UiInspector />

			{toast && (
				<div className={`ss-toast ${toast.kind === 'ok' ? 'ss-toast-ok' : 'ss-toast-error'}`}>
					{toast.kind === 'ok' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
					<span>{toast.msg}</span>
				</div>
			)}
		</div>
	);
}
