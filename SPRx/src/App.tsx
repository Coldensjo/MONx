import { useCallback, useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
	AlertCircle,
	CheckCircle2,
	FolderOpen,
	Grid3X3,
	Minus,
	PersonStanding,
	Package,
	SlidersHorizontal,
	Sparkles,
	Square,
	Wand2,
	X
} from 'lucide-react';
import { closeDat, closeSpr, openDat, OpenDat, openSpr, OpenFile, probePair, ThingCategory } from './spr';
import { ExportSettings, loadExportSettings, saveExportSettings } from './settings';
import Landing from './Landing';
import Viewer from './Viewer';
import ThingsView from './ThingsView';
import ExportSettingsDialog from './ExportSettingsDialog';

const RECENT_KEY = 'sprx.recent';
const MAX_RECENT = 8;

export interface Toast {
	kind: 'ok' | 'error';
	msg: string;
}

export interface FileSet {
	spr: OpenFile;
	dat: OpenDat | null;
	datError: string | null;
	transparent: boolean;
}

type Tab = ThingCategory | 'sprites';

function loadRecent(): string[] {
	try {
		const raw = localStorage.getItem(RECENT_KEY);
		const list = raw ? JSON.parse(raw) : [];
		return Array.isArray(list) ? list.filter(p => typeof p === 'string') : [];
	} catch {
		return [];
	}
}

function fileName(path: string): string {
	return path.split(/[\\/]/).pop() ?? path;
}

export default function App() {
	const [files, setFiles] = useState<FileSet | null>(null);
	const [tab, setTab] = useState<Tab>('item');
	const [thingSel, setThingSel] = useState<Partial<Record<ThingCategory, number>>>({});
	const [error, setError] = useState<string | null>(null);
	const [opening, setOpening] = useState(false);
	const [dropActive, setDropActive] = useState(false);
	const [recent, setRecent] = useState<string[]>(loadRecent);
	const [toast, setToast] = useState<Toast | null>(null);
	const [exportSettings, setExportSettings] = useState<ExportSettings>(loadExportSettings);
	const [showExportSettings, setShowExportSettings] = useState(false);

	const applyExportSettings = useCallback((settings: ExportSettings) => {
		setExportSettings(settings);
		saveExportSettings(settings);
	}, []);

	const showToast = useCallback((kind: Toast['kind'], msg: string) => {
		setToast({ kind, msg });
	}, []);

	useEffect(() => {
		if (!toast) return;
		const t = setTimeout(() => setToast(null), 3500);
		return () => clearTimeout(t);
	}, [toast]);

	const openFile = useCallback(
		async (path: string) => {
			setOpening(true);
			setError(null);
			try {
				const pair = await probePair(path);
				if (!pair.spr) {
					throw new Error(`No .spr file found next to ${fileName(path)}`);
				}
				if (files) {
					await closeSpr(files.spr.path).catch(() => {});
					if (files.dat) await closeDat(files.dat.path).catch(() => {});
				}
				const spr = await openSpr(pair.spr);
				const transparent = pair.transparency ?? spr.extended;
				let dat: OpenDat | null = null;
				let datError: string | null = null;
				if (pair.dat) {
					try {
						dat = await openDat(pair.dat);
					} catch (e) {
						datError = String(e);
					}
				} else {
					datError = 'No .dat file found next to the .spr';
				}
				setFiles({ spr, dat, datError, transparent });
				setThingSel({});
				setTab(dat ? 'item' : 'sprites');
				if (datError) showToast('error', `${datError} — showing raw sprites only`);
				setRecent(prev => {
					const next = [path, ...prev.filter(p => p !== path)].slice(0, MAX_RECENT);
					localStorage.setItem(RECENT_KEY, JSON.stringify(next));
					return next;
				});
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				setOpening(false);
			}
		},
		[files, showToast]
	);

	const pickFile = useCallback(async () => {
		const picked = await openDialog({
			multiple: false,
			filters: [{ name: 'Tibia client files', extensions: ['dat', 'spr'] }]
		});
		if (typeof picked === 'string') await openFile(picked);
	}, [openFile]);

	const closeFile = useCallback(async () => {
		if (files) {
			await closeSpr(files.spr.path).catch(() => {});
			if (files.dat) await closeDat(files.dat.path).catch(() => {});
		}
		setFiles(null);
		setError(null);
	}, [files]);

	useEffect(() => {
		const un = getCurrentWebview().onDragDropEvent(event => {
			const payload = event.payload;
			if (payload.type === 'enter' || payload.type === 'over') {
				setDropActive(true);
			} else if (payload.type === 'leave') {
				setDropActive(false);
			} else if (payload.type === 'drop') {
				setDropActive(false);
				const file = payload.paths.find(p => /\.(spr|dat)$/i.test(p));
				if (file) void openFile(file);
			}
		});
		return () => {
			void un.then(f => f());
		};
	}, [openFile]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
				e.preventDefault();
				void pickFile();
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [pickFile]);

	const win = getCurrentWindow();

	const navItems: { key: Tab; label: string; icon: JSX.Element; count: number | null; disabled: boolean }[] =
		files
			? [
					{
						key: 'item',
						label: 'Items',
						icon: <Package size={16} />,
						count: files.dat ? files.dat.itemLastId - files.dat.itemFirstId + 1 : null,
						disabled: !files.dat
					},
					{
						key: 'outfit',
						label: 'Outfits',
						icon: <PersonStanding size={16} />,
						count: files.dat?.outfitCount ?? null,
						disabled: !files.dat
					},
					{
						key: 'effect',
						label: 'Effects',
						icon: <Sparkles size={16} />,
						count: files.dat?.effectCount ?? null,
						disabled: !files.dat
					},
					{
						key: 'missile',
						label: 'Missiles',
						icon: <Wand2 size={16} />,
						count: files.dat?.missileCount ?? null,
						disabled: !files.dat
					},
					{
						key: 'sprites',
						label: 'Sprites',
						icon: <Grid3X3 size={16} />,
						count: files.spr.spriteCount,
						disabled: false
					}
				]
			: [];

	const openName = files
		? fileName(files.dat ? files.dat.path : files.spr.path).replace(/\.(dat|spr)$/i, '')
		: '';

	return (
		<div className="ss-app">
			<div className="ss-titlebar" data-tauri-drag-region>
				<div className="ss-titlebar-title">
					<img src="/icon.png" alt="" className="ss-titlebar-icon" width={14} height={14} />
					<span>SPRx</span>
					{files && <span className="ss-titlebar-file">— {openName}</span>}
				</div>
				<div className="ss-titlebar-spacer" data-tauri-drag-region />
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

			{files ? (
				<div className="ss-body">
					<aside className="ss-sidebar">
						<div className="ss-sidebar-file" title={files.dat?.path ?? files.spr.path}>
							{openName}
						</div>
						<nav className="ss-sidebar-nav">
							{navItems.map(t => (
								<button
									key={t.key}
									className={`ss-nav-item ${tab === t.key ? 'ss-nav-item-active' : ''}`}
									disabled={t.disabled}
									onClick={() => setTab(t.key)}
								>
									{t.icon}
									<span className="ss-nav-label">{t.label}</span>
									{t.count !== null && (
										<span className="ss-nav-meta">{t.count.toLocaleString()}</span>
									)}
								</button>
							))}
						</nav>
						<div className="ss-sidebar-footer">
							<button className="ss-icon-btn" onClick={() => void pickFile()}>
								<FolderOpen size={14} />
								Open other
							</button>
							<button className="ss-icon-btn" onClick={() => setShowExportSettings(true)}>
								<SlidersHorizontal size={14} />
								Export settings
							</button>
							<button className="ss-icon-btn" onClick={() => void closeFile()}>
								<X size={14} />
								Close file
							</button>
						</div>
					</aside>

					<main className="ss-main">
						{tab === 'sprites' ? (
							<Viewer
								key={files.spr.path}
								file={files.spr}
								transparent={files.transparent}
								onTransparentChange={transparent =>
									setFiles(f => (f ? { ...f, transparent } : f))
								}
								exportSettings={exportSettings}
								showToast={showToast}
							/>
						) : files.dat ? (
							<ThingsView
								key={`${files.dat.path}-${tab}`}
								spr={files.spr}
								dat={files.dat}
								category={tab}
								selectedId={thingSel[tab] ?? null}
								onSelect={id => setThingSel(s => ({ ...s, [tab]: id }))}
								transparent={files.transparent}
								onTransparentChange={transparent =>
									setFiles(f => (f ? { ...f, transparent } : f))
								}
								exportSettings={exportSettings}
								showToast={showToast}
							/>
						) : null}
					</main>
				</div>
			) : (
				<Landing
					recent={recent}
					error={error}
					opening={opening}
					dropActive={dropActive}
					onPick={() => void pickFile()}
					onOpenRecent={path => void openFile(path)}
				/>
			)}

			{showExportSettings && (
				<ExportSettingsDialog
					settings={exportSettings}
					onSave={applyExportSettings}
					onClose={() => setShowExportSettings(false)}
				/>
			)}

			{toast && (
				<div className={`ss-toast ${toast.kind === 'ok' ? 'ss-toast-ok' : 'ss-toast-error'}`}>
					{toast.kind === 'ok' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
					<span>{toast.msg}</span>
				</div>
			)}
		</div>
	);
}
