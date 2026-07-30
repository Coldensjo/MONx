import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { MonsterSummary } from './monster';

interface Props {
	monsters: MonsterSummary[];
	/** Files with an unsaved buffer, marked in the list as the tab strip marks them. */
	dirtyFiles: Set<string>;
	onPick: (file: string) => void;
	onClose: () => void;
}

/** How many hits the list shows — enough to scroll, few enough to stay instant. */
const MAX_ROWS = 40;

interface Hit {
	monster: MonsterSummary;
	score: number;
	/** Indices of `label` the query matched, for the highlight. */
	at: number[];
}

/**
 * Subsequence match with a bias toward tight, word-start runs: "dsk" finds
 * "Demon Skeleton" ahead of "Dark Sorcerer Knight" because its matches are
 * closer together and land on word boundaries. Returns null when a character
 * of the query is missing, which is what makes typing narrow rather than sort.
 */
function fuzzy(label: string, query: string): { score: number; at: number[] } | null {
	const hay = label.toLowerCase();
	let i = 0;
	let score = 0;
	let last = -2;
	const at: number[] = [];
	for (const ch of query) {
		const found = hay.indexOf(ch, i);
		if (found === -1) return null;
		// Adjacent characters and word starts are what a human means by "close".
		if (found === last + 1) score += 8;
		if (found === 0 || /[\s_\-.]/.test(hay[found - 1])) score += 6;
		score -= Math.min(found - i, 8);
		at.push(found);
		last = found;
		i = found + 1;
	}
	// A short name matching the same query is the better hit.
	return { score: score - label.length / 20, at };
}

function Highlight({ text, at }: { text: string; at: number[] }) {
	const set = new Set(at);
	return (
		<>
			{[...text].map((ch, i) =>
				set.has(i) ? (
					<mark className="mx-qo-hit" key={i}>
						{ch}
					</mark>
				) : (
					<span key={i}>{ch}</span>
				)
			)}
		</>
	);
}

/**
 * Quick-open: type a few letters, hit Enter, land on the monster. Matches on
 * name and file together, so "demon.xml" and "Demon" both work, and the recent
 * order is left alone — the ranking is the query's, not a history's.
 */
export default function QuickOpenDialog({ monsters, dirtyFiles, onPick, onClose }: Props) {
	const { t } = useTranslation();
	const [query, setQuery] = useState('');
	const [active, setActive] = useState(0);
	const listRef = useRef<HTMLDivElement>(null);

	const hits = useMemo<Hit[]>(() => {
		const q = query.trim().toLowerCase();
		if (!q) {
			return monsters.slice(0, MAX_ROWS).map(m => ({ monster: m, score: 0, at: [] }));
		}
		const out: Hit[] = [];
		for (const m of monsters) {
			// The file is searched too, but only the name is highlighted — a hit
			// on the file alone still shows up, just without marks.
			const byName = fuzzy(m.name, q);
			const byFile = byName ? null : fuzzy(m.file, q);
			if (!byName && !byFile) continue;
			out.push({ monster: m, score: byName?.score ?? (byFile as { score: number }).score - 20, at: byName?.at ?? [] });
		}
		out.sort((a, b) => b.score - a.score || a.monster.name.localeCompare(b.monster.name));
		return out.slice(0, MAX_ROWS);
	}, [monsters, query]);

	// A new query means a new best hit; the selection follows it rather than
	// staying on whatever row happens to be at the old index.
	useEffect(() => setActive(0), [query]);

	useEffect(() => {
		listRef.current?.querySelector('.mx-qo-row-active')?.scrollIntoView({ block: 'nearest' });
	}, [active, hits]);

	const commit = (i: number) => {
		const hit = hits[i];
		if (!hit) return;
		onPick(hit.monster.file);
		onClose();
	};

	const onKey = (e: React.KeyboardEvent) => {
		if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
			e.preventDefault();
			setActive(a => Math.min(hits.length - 1, a + 1));
		} else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
			e.preventDefault();
			setActive(a => Math.max(0, a - 1));
		} else if (e.key === 'Enter') {
			e.preventDefault();
			commit(active);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
		}
	};

	return (
		<div className="ss-backdrop mx-qo-backdrop" onMouseDown={onClose}>
			<div className="ss-modal mx-qo-modal" onMouseDown={e => e.stopPropagation()}>
				<div className="ss-search mx-qo-search">
					<Search size={14} />
					<input
						autoFocus
						value={query}
						spellCheck={false}
						placeholder={t('Go to monster…')}
						onChange={e => setQuery(e.target.value)}
						onKeyDown={onKey}
					/>
				</div>
				<div className="mx-qo-list" ref={listRef}>
					{hits.length === 0 && <div className="ss-ed-empty">{t('No monster matches.')}</div>}
					{hits.map((h, i) => (
						<button
							type="button"
							key={h.monster.file}
							className={`mx-qo-row${i === active ? ' mx-qo-row-active' : ''}`}
							// Mouse-down rather than click: the input keeps focus, so the
							// arrow keys still work after pointing at a row.
							onMouseDown={e => {
								e.preventDefault();
								commit(i);
							}}
							onMouseEnter={() => setActive(i)}
						>
							<span className="mx-qo-name">
								<Highlight text={h.monster.name} at={h.at} />
								{dirtyFiles.has(h.monster.file) && <span className="mx-qo-dirty">•</span>}
							</span>
							<span className="mx-qo-file">{h.monster.file}</span>
							{h.monster.lintCounts.error > 0 && (
								<span className="ss-mon-badge ss-mon-badge-error">{h.monster.lintCounts.error}</span>
							)}
						</button>
					))}
				</div>
				{/* Three key/verb pairs rather than one sentence with markup through
				    it — a translator can reorder each pair freely. */}
				<div className="mx-qo-foot">
					<span className="mono">↑↓</span> {t('move')} · <span className="mono">Enter</span> {t('open')} ·{' '}
					<span className="mono">Esc</span> {t('close')}
				</div>
			</div>
		</div>
	);
}
