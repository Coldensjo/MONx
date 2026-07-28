import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Lint, MonsterDoc, SpellName } from './monster';
import { PreviewProvider, type PreviewUrl } from './fields/preview';
import { tauriItemIndex, type ItemIndex } from './fields/ItemPicker';
import { SECTION_IDS, SECTION_LABEL, type SectionId } from './sections/section';
import { Identity } from './sections/Identity';
import { LookSection } from './sections/LookSection';
import { Combat } from './sections/Combat';
import { Spells } from './sections/Spells';
import { Resistances } from './sections/Resistances';
import { Loot } from './sections/Loot';
import { Summons } from './sections/Summons';
import { VoicesEvents } from './sections/VoicesEvents';

const STATE_KEY = 'monx.editor';

interface EditorState {
	collapsed: SectionId[];
}

function loadState(): EditorState {
	try {
		const raw = localStorage.getItem(STATE_KEY);
		if (!raw) return { collapsed: [] };
		const parsed = JSON.parse(raw) as Partial<EditorState>;
		const valid = (parsed.collapsed ?? []).filter((id): id is SectionId =>
			(SECTION_IDS as readonly string[]).includes(id)
		);
		return { collapsed: valid };
	} catch {
		return { collapsed: [] };
	}
}

export interface MonsterEditorProps {
	doc: MonsterDoc;
	/** Whole-doc immutable updates — the editor never mutates what it is given. */
	onChange: (doc: MonsterDoc) => void;
	lints: Lint[];
	spells: SpellName[];
	readOnly: boolean;
	/** Defaults to the Tauri-backed index; injectable for fixture-only rendering. */
	items?: ItemIndex;
	/** `.lua` files in monster/scripts, for the Identity dropdown. */
	scripts?: string[];
	/** Registered monster names, for summon validation. */
	monsterNames?: string[];
	/** Event names from creaturescripts.xml, when reachable. */
	knownEvents?: string[];
	nextRaceid?: number | null;
	onSave?: () => void;
	onBrowseOutfits?: () => void;
	/** Resolves client things to protocol URLs; without it previews degrade to ids. */
	previewUrl?: PreviewUrl;
}

export function MonsterEditor({
	doc,
	onChange,
	lints,
	spells,
	readOnly,
	items = tauriItemIndex,
	scripts = [],
	monsterNames = [],
	knownEvents,
	nextRaceid = null,
	onSave,
	onBrowseOutfits,
	previewUrl
}: MonsterEditorProps) {
	const [collapsed, setCollapsed] = useState<Set<SectionId>>(() => new Set(loadState().collapsed));
	const [active, setActive] = useState<SectionId>('identity');
	const scrollRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		localStorage.setItem(STATE_KEY, JSON.stringify({ collapsed: [...collapsed] } satisfies EditorState));
	}, [collapsed]);

	useEffect(() => {
		if (!onSave) return;
		const onKey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
				e.preventDefault();
				onSave();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onSave]);

	// Lints arrive as a flat list keyed by dot path; every field asks for its own.
	const byPath = useMemo(() => {
		const map = new Map<string, Lint[]>();
		for (const l of lints) {
			if (!l.path) continue;
			const list = map.get(l.path);
			if (list) list.push(l);
			else map.set(l.path, [l]);
		}
		return map;
	}, [lints]);

	const lintAt = useCallback((path: string) => byPath.get(path) ?? [], [byPath]);

	const patch = useCallback(
		(p: Partial<MonsterDoc>) => {
			// unknownAttributes and comments are never in `p` — they are carried
			// through by the spread, which is what keeps round-trip intact.
			onChange({ ...doc, ...p });
		},
		[doc, onChange]
	);

	const toggle = useCallback((id: SectionId) => {
		setCollapsed(prev => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const jump = (id: SectionId) => {
		setActive(id);
		setCollapsed(prev => {
			if (!prev.has(id)) return prev;
			const next = new Set(prev);
			next.delete(id);
			return next;
		});
		document.getElementById(`ss-ed-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	const lintCounts = useMemo(() => {
		let error = 0;
		let warning = 0;
		for (const l of lints) {
			if (l.severity === 'error') error++;
			else if (l.severity === 'warning') warning++;
		}
		return { error, warning };
	}, [lints]);

	const common = {
		doc,
		patch,
		lintAt,
		items,
		spells,
		scripts,
		monsterNames,
		nextRaceid,
		readOnly,
		onBrowseOutfits
	};

	return (
		<PreviewProvider value={previewUrl ?? null}>
			<div className="ss-ed">
				<nav className="ss-ed-bar">
					{SECTION_IDS.map(id => (
						<button
							key={id}
							type="button"
							className={id === active ? 'ss-ed-tab ss-ed-tab-active' : 'ss-ed-tab'}
							onClick={() => jump(id)}
						>
							{SECTION_LABEL[id]}
						</button>
					))}
					{(lintCounts.error > 0 || lintCounts.warning > 0) && (
						<span className="ss-ed-bar-lints">
							{lintCounts.error > 0 && <span className="ss-ed-lint ss-ed-lint-error">{lintCounts.error}</span>}
							{lintCounts.warning > 0 && <span className="ss-ed-lint ss-ed-lint-warning">{lintCounts.warning}</span>}
						</span>
					)}
				</nav>

				<div className="ss-ed-scroll" ref={scrollRef}>
					<div className="ss-ed-column">
						{readOnly && (
							<div className="ss-ed-banner ss-ed-banner-warn ss-ed-readonly">
								<AlertTriangle size={14} />
								Read-only — this file cannot be written back without losing something. Fix the reported problems to
								enable editing.
							</div>
						)}

						<Identity {...common} collapsed={collapsed.has('identity')} onToggle={toggle} />
						<LookSection {...common} collapsed={collapsed.has('look')} onToggle={toggle} />
						<Combat {...common} collapsed={collapsed.has('combat')} onToggle={toggle} />
						<Spells {...common} which="attacks" collapsed={collapsed.has('attacks')} onToggle={toggle} />
						<Spells {...common} which="defenses" collapsed={collapsed.has('defenses')} onToggle={toggle} />
						<Resistances {...common} collapsed={collapsed.has('resistances')} onToggle={toggle} />
						<Loot {...common} collapsed={collapsed.has('loot')} onToggle={toggle} />
						<Summons {...common} collapsed={collapsed.has('summons')} onToggle={toggle} />
						<VoicesEvents
							{...common}
							knownEvents={knownEvents}
							collapsed={collapsed.has('voices')}
							onToggle={toggle}
						/>
					</div>
				</div>
			</div>
		</PreviewProvider>
	);
}
