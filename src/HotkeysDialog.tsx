import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import {
	chordFrom,
	conflicts,
	DEFAULT_BINDINGS,
	formatChord,
	type Binding,
	type Bindings,
	type Command
} from './hotkeys';

interface Props {
	commands: Command[];
	bindings: Bindings;
	/** Called with the whole map on every edit; the shell stores it. */
	onChange: (next: Bindings) => void;
	onClose: () => void;
}

type Slot = 'primary' | 'secondary';

const EMPTY: Binding = { primary: null, secondary: null };

/**
 * The hotkey manager: every command the shell has, with a primary and a
 * secondary chord each. Capture is live — the next key pressed becomes the
 * binding, Escape backs out, Backspace clears — because typing "Ctrl+Shift+K"
 * into a text field is a worse way to describe a key than pressing it.
 *
 * Assigning a chord that another command holds takes it away rather than
 * shadowing it: two commands on one key would mean the list no longer says what
 * the keyboard does.
 */
export default function HotkeysDialog({ commands, bindings, onChange, onClose }: Props) {
	const [query, setQuery] = useState('');
	/** Which slot is listening for a key, if any. */
	const [capturing, setCapturing] = useState<{ id: string; slot: Slot } | null>(null);
	/** Transient note under the row a chord was just taken from. */
	const [stolen, setStolen] = useState<string | null>(null);

	const get = (id: string): Binding => bindings[id] ?? EMPTY;

	const assign = (id: string, slot: Slot, chord: string | null) => {
		const next: Bindings = { ...bindings };
		let takenFrom: string | null = null;
		if (chord) {
			for (const [other, b] of Object.entries(next)) {
				if (other === id && b[slot] === chord) continue;
				const hit: Slot | null = b.primary === chord ? 'primary' : b.secondary === chord ? 'secondary' : null;
				if (!hit) continue;
				if (other !== id) takenFrom = commands.find(c => c.id === other)?.label ?? other;
				next[other] = { ...b, [hit]: null };
			}
		}
		next[id] = { ...(next[id] ?? EMPTY), [slot]: chord };
		setStolen(takenFrom && `Taken from “${takenFrom}”.`);
		onChange(next);
	};

	// Capture runs on the capture phase so nothing else — a focused button's
	// Enter, the dialog's Escape — sees the key first.
	useEffect(() => {
		if (!capturing) return;
		const onKey = (e: KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();
			const chord = chordFrom(e);
			if (!chord) return; // a modifier being held down
			setCapturing(null);
			if (chord === 'Esc') return;
			if (chord === 'Backspace' || chord === 'Delete') {
				assign(capturing.id, capturing.slot, null);
				return;
			}
			assign(capturing.id, capturing.slot, chord);
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	});

	// Escape closes the dialog only when nothing is being captured — while a slot
	// is listening, Escape belongs to the capture.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && !capturing) onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [capturing, onClose]);

	const clash = useMemo(() => conflicts(bindings), [bindings]);

	const shown = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return commands;
		return commands.filter(
			c =>
				c.label.toLowerCase().includes(q) ||
				c.group.toLowerCase().includes(q) ||
				formatChord(get(c.id).primary).toLowerCase().includes(q) ||
				formatChord(get(c.id).secondary).toLowerCase().includes(q)
		);
	}, [commands, query, bindings]);

	const groups = useMemo(() => {
		const out = new Map<string, Command[]>();
		for (const c of shown) {
			const list = out.get(c.group);
			if (list) list.push(c);
			else out.set(c.group, [c]);
		}
		return [...out.entries()];
	}, [shown]);

	const isDefault = (id: string) => {
		const d = DEFAULT_BINDINGS[id] ?? EMPTY;
		const b = get(id);
		return d.primary === b.primary && d.secondary === b.secondary;
	};

	const chip = (c: Command, slot: Slot) => {
		const chord = get(c.id)[slot];
		const armed = capturing?.id === c.id && capturing.slot === slot;
		const shared = chord ? (clash.get(chord)?.length ?? 0) > 1 : false;
		return (
			<button
				type="button"
				className={`mx-hk-chip${armed ? ' mx-hk-chip-armed' : ''}${chord ? '' : ' mx-hk-chip-empty'}${
					shared ? ' mx-hk-chip-clash' : ''
				}`}
				onClick={() => setCapturing(armed ? null : { id: c.id, slot })}
				title={armed ? 'Press a key — Esc cancels, Backspace clears' : `Set the ${slot} hotkey`}
			>
				{armed ? 'Press a key…' : chord ? formatChord(chord) : '—'}
			</button>
		);
	};

	return (
		<div className="ss-backdrop" onMouseDown={onClose}>
			<div className="ss-modal mx-hk-modal" onMouseDown={e => e.stopPropagation()}>
				<div className="ss-modal-title">Hotkeys</div>

				<div className="ss-modal-desc">
					Click a slot, then press the keys. <span className="mono">Esc</span> cancels,{' '}
					<span className="mono">Backspace</span> clears. Every command takes a primary and a secondary
					binding.
					{stolen && <span className="mx-hk-note"> {stolen}</span>}
				</div>

				<div className="ss-search mx-hk-search">
					<Search size={13} />
					<input
						autoFocus
						value={query}
						placeholder="Search commands"
						spellCheck={false}
						onChange={e => setQuery(e.target.value)}
					/>
				</div>

				<div className="mx-hk-list">
					<div className="mx-hk-row mx-hk-head">
						<span />
						<span>Primary</span>
						<span>Secondary</span>
						<span />
					</div>
					{groups.map(([group, list]) => (
						<div key={group}>
							<div className="mx-hk-group">{group}</div>
							{list.map(c => (
								<div className="mx-hk-row" key={c.id}>
									<span className="mx-hk-label" title={c.id}>
										{c.label}
									</span>
									{chip(c, 'primary')}
									{chip(c, 'secondary')}
									<button
										type="button"
										className="ss-btn ss-btn-ghost ss-ed-mini"
										disabled={isDefault(c.id)}
										title="Back to the default binding"
										onClick={() => onChange({ ...bindings, [c.id]: DEFAULT_BINDINGS[c.id] ?? EMPTY })}
									>
										<RotateCcw size={12} />
									</button>
								</div>
							))}
						</div>
					))}
					{shown.length === 0 && <div className="ss-ed-empty">No command matches.</div>}
				</div>

				<div className="ss-modal-buttons">
					<button className="ss-btn ss-btn-ghost" onClick={() => onChange({ ...DEFAULT_BINDINGS })}>
						Reset all
					</button>
					<div className="ss-modal-buttons-spacer" />
					<button className="ss-btn ss-btn-primary" onClick={onClose}>
						Done
					</button>
				</div>
			</div>
		</div>
	);
}
