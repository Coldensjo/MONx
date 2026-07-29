import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dices } from 'lucide-react';
import type { ItemIndex, ItemInfo, LootEntry } from './monster';
import { NumberField } from './fields/NumberField';
import { ItemSprite } from './fields/ItemPicker';
import { percentText } from './sections/Loot';
import { expectedLootValue } from './derive';
import { loadSetting, saveSetting } from './settings';
import { simulate, type Resolve, type SimParams, type SimResult } from './lootsim';

// The loot simulator dialog (LOOT_SIMULATOR.md §2, §3, §5). Runs against the
// unsaved editor buffer — that is the point: tweak a chance, simulate, tweak
// again, no save in between.

interface Props {
	loot: LootEntry[];
	monsterName: string;
	items: ItemIndex;
	onClose: () => void;
}

/** `time` hunts for a stretch of clock and derives the kill count from cadence;
 *  `kills` skips the clock entirely — the player instantly kills N monsters. */
type Mode = 'time' | 'kills';

interface Inputs {
	mode: Mode;
	sessionMinutes: number;
	killSeconds: number;
	gapSeconds: number;
	/** Kills per run in `kills` mode; ignored in `time` mode. */
	kills: number;
	lootRate: number;
	sessions: number;
	/** 0 means "roll a fresh seed each run". */
	seed: number;
}

const DEFAULTS: Inputs = {
	mode: 'time',
	sessionMinutes: 60,
	killSeconds: 10,
	gapSeconds: 20,
	kills: 1000,
	lootRate: 1,
	sessions: 25,
	seed: 0
};
const SETTINGS_KEY = 'monx.lootsim.params';

function loadInputs(): Inputs {
	try {
		const raw = loadSetting(SETTINGS_KEY, null);
		if (!raw) return DEFAULTS;
		const p = JSON.parse(raw);
		const num = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
		return {
			mode: p.mode === 'kills' ? 'kills' : 'time',
			sessionMinutes: num(p.sessionMinutes, DEFAULTS.sessionMinutes),
			killSeconds: num(p.killSeconds, DEFAULTS.killSeconds),
			gapSeconds: num(p.gapSeconds, DEFAULTS.gapSeconds),
			kills: num(p.kills, DEFAULTS.kills),
			lootRate: num(p.lootRate, DEFAULTS.lootRate),
			sessions: num(p.sessions, DEFAULTS.sessions),
			seed: num(p.seed, DEFAULTS.seed)
		};
	} catch {
		return DEFAULTS;
	}
}

/**
 * Resolves every entry the way the loader would: by id when pinned, else by
 * exact (case-insensitive) items.xml name — zero or several owners means the
 * server drops the entry, so resolution yields null (§13).
 */
async function resolveLoot(loot: LootEntry[], items: ItemIndex): Promise<Map<LootEntry, ItemInfo | null>> {
	const map = new Map<LootEntry, ItemInfo | null>();
	const walk = async (entries: LootEntry[]) => {
		for (const entry of entries) {
			if (entry.id !== null) {
				map.set(entry, await items.get(entry.id));
			} else {
				const name = (entry.name ?? '').trim().toLowerCase();
				if (!name) {
					map.set(entry, null);
				} else {
					const hits = (await items.search(name, 50)).filter(i => i.name.toLowerCase() === name);
					const distinct = new Set(hits.map(i => i.serverId));
					map.set(entry, distinct.size === 1 && !hits[0].ambiguousName ? hits[0] : null);
				}
			}
			await walk(entry.children);
		}
	};
	await walk(loot);
	return map;
}

function median(sorted: number[]): number {
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function gp(n: number): string {
	return `${Math.round(n).toLocaleString()} gp`;
}

function duration(seconds: number): string {
	if (seconds < 60) return `${Math.round(seconds)}s`;
	if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
	const h = Math.floor(seconds / 3600);
	const m = Math.round((seconds % 3600) / 60);
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function LootSimDialog({ loot, monsterName, items, onClose }: Props) {
	const [inputs, setInputs] = useState<Inputs>(loadInputs);
	const [resolved, setResolved] = useState<Map<LootEntry, ItemInfo | null> | null>(null);
	const [result, setResult] = useState<SimResult | null>(null);
	const [ranSeed, setRanSeed] = useState<number | null>(null);
	const [view, setView] = useState<'totals' | 'log'>('totals');

	useEffect(() => saveSetting(SETTINGS_KEY, JSON.stringify(inputs)), [inputs]);

	// Re-resolve when the loot buffer changes; a stale result would lie about it.
	useEffect(() => {
		let live = true;
		setResolved(null);
		setResult(null);
		resolveLoot(loot, items).then(m => {
			if (live) setResolved(m);
		});
		return () => {
			live = false;
		};
	}, [loot, items]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onClose]);

	const set = (patch: Partial<Inputs>) => setInputs(prev => ({ ...prev, ...patch }));

	const timeMode = inputs.mode === 'time';
	const cadence = Math.max(1, inputs.killSeconds + inputs.gapSeconds);
	const killsPerSession = timeMode
		? Math.floor(Math.max(0, inputs.sessionMinutes * 60) / cadence)
		: Math.max(0, Math.floor(inputs.kills));
	// Kill mode has no clock at all, so nothing is expressed per hour. `hours` of
	// 0 is the flag for that: every rate below falls back to "per run".
	const hours = timeMode ? Math.max(inputs.sessionMinutes, 1) / 60 : 0;

	// Analytic baseline (derive.ts) over the same resolved items, for the
	// "should have been" line beside the simulated gp/h.
	const itemMap = useMemo(() => {
		const m = new Map<number, ItemInfo>();
		if (resolved) for (const info of resolved.values()) if (info) m.set(info.serverId, info);
		return m;
	}, [resolved]);
	const expected = useMemo(() => expectedLootValue(loot, itemMap), [loot, itemMap]);

	const run = useCallback(() => {
		if (!resolved) return;
		const resolve: Resolve = entry => resolved.get(entry) ?? null;
		const seed = inputs.seed !== 0 ? inputs.seed : Math.floor(Math.random() * 2 ** 31);
		const params: SimParams = {
			killsPerSession,
			lootRate: Math.max(0, inputs.lootRate),
			sessions: inputs.sessions,
			seed
		};
		setRanSeed(seed);
		setResult(simulate(loot, resolve, params));
	}, [resolved, inputs, killsPerSession, loot]);

	const stats = useMemo(() => {
		if (!result) return null;
		const totalKills = result.killsPerSession * result.sessions;
		const totalGp = result.perSessionGp.reduce((a, b) => a + b, 0);
		const meanGp = totalGp / result.sessions;
		// hours === 0 is kill mode: the spread stays in gp per run.
		const scale = hours > 0 ? 1 / hours : 1;
		const rates = [...result.perSessionGp].sort((a, b) => a - b).map(v => v * scale);
		return {
			totalKills,
			totalGp,
			meanGp,
			gpPerHour: meanGp * scale,
			gpPerKill: result.killsPerSession > 0 ? meanGp / result.killsPerSession : 0,
			minRate: rates[0] ?? 0,
			medianRate: median(rates),
			maxRate: rates[rates.length - 1] ?? 0
		};
	}, [result, hours]);

	const expectedPerHour = hours > 0 ? (expected.expected * killsPerSession) / hours : expected.expected * killsPerSession;

	return (
		<div className="ss-backdrop" onMouseDown={onClose}>
			<div className="ss-modal ss-lootsim-modal" onMouseDown={e => e.stopPropagation()}>
				<div className="ss-modal-title">Loot simulator — {monsterName}</div>

				<div className="ss-lootsim-modes">
					<button
						type="button"
						className={`ss-btn ss-btn-ghost ss-ed-mini${timeMode ? ' ss-lootsim-tab-on' : ''}`}
						onClick={() => set({ mode: 'time' })}
						title="Hunt for a stretch of time; kills follow from the cadence"
					>
						By time
					</button>
					<button
						type="button"
						className={`ss-btn ss-btn-ghost ss-ed-mini${!timeMode ? ' ss-lootsim-tab-on' : ''}`}
						onClick={() => set({ mode: 'kills' })}
						title="Kill a fixed number of monsters instantly — no clock, no cadence"
					>
						By kills
					</button>
				</div>

				<div className="ss-lootsim-inputs">
					{timeMode ? (
						<>
							<label className="ss-lootsim-input">
								<span>Session</span>
								<NumberField value={inputs.sessionMinutes} onChange={v => set({ sessionMinutes: v })} min={1} width={70} title="Session length in minutes" />
								<span className="ss-lootsim-unit">min</span>
								{[15, 60, 180].map(m => (
									<button
										key={m}
										type="button"
										className={`ss-btn ss-btn-ghost ss-ed-mini${inputs.sessionMinutes === m ? ' ss-lootsim-preset-on' : ''}`}
										onClick={() => set({ sessionMinutes: m })}
									>
										{m < 60 ? `${m}m` : `${m / 60}h`}
									</button>
								))}
							</label>
							<label className="ss-lootsim-input">
								<span>Per kill</span>
								<NumberField value={inputs.killSeconds} onChange={v => set({ killSeconds: v })} min={0} width={58} title="Fight duration in seconds" />
								<span className="ss-lootsim-unit">s</span>
							</label>
							<label className="ss-lootsim-input">
								<span>Between kills</span>
								<NumberField value={inputs.gapSeconds} onChange={v => set({ gapSeconds: v })} min={0} width={58} title="Walking, respawn, targeting" />
								<span className="ss-lootsim-unit">s</span>
							</label>
						</>
					) : (
						<label className="ss-lootsim-input">
							<span>Kills</span>
							<NumberField value={inputs.kills} onChange={v => set({ kills: v })} min={0} max={100000} width={90} title="Monsters killed per run, instantly" />
							{[100, 1000, 10000].map(k => (
								<button
									key={k}
									type="button"
									className={`ss-btn ss-btn-ghost ss-ed-mini${inputs.kills === k ? ' ss-lootsim-preset-on' : ''}`}
									onClick={() => set({ kills: k })}
								>
									{k >= 1000 ? `${k / 1000}k` : k}
								</button>
							))}
						</label>
					)}
					<label className="ss-lootsim-input">
						<span>Loot rate</span>
						<NumberField value={inputs.lootRate} onChange={v => set({ lootRate: v })} min={0} step={0.5} width={58} title="Server loot-rate multiplier; chances clamp at 100%" />
						<span className="ss-lootsim-unit">×</span>
					</label>
					<label className="ss-lootsim-input">
						<span>{timeMode ? 'Sessions' : 'Runs'}</span>
						<NumberField value={inputs.sessions} onChange={v => set({ sessions: v })} min={1} max={1000} width={58} title="1 is a single concrete hunt; more shows the spread" />
					</label>
					<label className="ss-lootsim-input">
						<span>Seed</span>
						<NumberField value={inputs.seed} onChange={v => set({ seed: v })} min={0} width={90} title="0 rolls a fresh seed each run; any other value reproduces a run exactly" />
					</label>
				</div>

				<div className="ss-lootsim-derived">
					{timeMode ? (
						<>
							{killsPerSession.toLocaleString()} kills per session at one kill every {cadence}s
						</>
					) : (
						<>
							{killsPerSession.toLocaleString()} kills per run, killed instantly — no clock, so totals are per run
						</>
					)}
					{ranSeed !== null && inputs.seed === 0 && <> · seed {ranSeed}</>}
				</div>

				{result && stats && (
					<>
						<div className="ss-lootsim-headline">
							<div className="ss-lootsim-stat">
								<span className="ss-lootsim-stat-value">{Math.round(stats.gpPerHour).toLocaleString()}</span>
								<span className="ss-lootsim-stat-label">{timeMode ? 'gp/h' : 'gp per run'}</span>
							</div>
							<div className="ss-lootsim-stat">
								<span className="ss-lootsim-stat-value">
									{timeMode ? gp(stats.meanGp) : result.killsPerSession.toLocaleString()}
								</span>
								<span className="ss-lootsim-stat-label">{timeMode ? 'per session' : 'kills per run'}</span>
							</div>
							<div className="ss-lootsim-stat">
								<span className="ss-lootsim-stat-value">{stats.gpPerKill.toFixed(1)}</span>
								<span className="ss-lootsim-stat-label">gp per kill</span>
							</div>
							<div className="ss-lootsim-stat">
								<span className="ss-lootsim-stat-value">{Math.round(expectedPerHour).toLocaleString()}</span>
								<span className="ss-lootsim-stat-label">{timeMode ? 'expected gp/h' : 'expected gp per run'}</span>
							</div>
						</div>
						{result.sessions > 1 && (
							<div className="ss-lootsim-spread">
								Across {result.sessions} {timeMode ? 'sessions' : 'runs'}: {Math.round(stats.minRate).toLocaleString()} /{' '}
								{Math.round(stats.medianRate).toLocaleString()} / {Math.round(stats.maxRate).toLocaleString()}{' '}
								{timeMode ? 'gp/h' : 'gp'} (min / median / max)
							</div>
						)}

						<div className="ss-lootsim-tabs">
							<button
								type="button"
								className={`ss-btn ss-btn-ghost ss-ed-mini${view === 'totals' ? ' ss-lootsim-tab-on' : ''}`}
								onClick={() => setView('totals')}
							>
								Totals
							</button>
							<button
								type="button"
								className={`ss-btn ss-btn-ghost ss-ed-mini${view === 'log' ? ' ss-lootsim-tab-on' : ''}`}
								onClick={() => setView('log')}
								title="Kill-by-kill corpses of the first session"
							>
								Corpse log
							</button>
						</div>

						{view === 'log' ? (
							<div className="ss-lootsim-table ss-lootsim-log">
								{result.log.map((drops, k) => (
									<div className="ss-lootsim-log-row" key={k}>
										<span className="ss-lootsim-log-kill mono">#{k + 1}</span>
										{drops.length === 0 ? (
											<span className="ss-lootsim-log-nothing">—</span>
										) : (
											drops.map((d, i) => (
												<span key={i} className="ss-lootsim-log-drop" title={d.name}>
													<ItemSprite serverId={d.serverId} size={24} />
													{d.count > 1 && <span className="mono">×{d.count}</span>}
												</span>
											))
										)}
									</div>
								))}
								{result.logTruncated && (
									<div className="ss-lootsim-empty">Log capped at the first {result.log.length.toLocaleString()} kills.</div>
								)}
								{result.log.length === 0 && <div className="ss-lootsim-empty">No kills in the session.</div>}
							</div>
						) : (
						<div className="ss-lootsim-table">
							<div className="ss-lootsim-row ss-lootsim-head">
								<span />
								<span>Item</span>
								<span>Total</span>
								<span>Drops</span>
								<span>1st drop</span>
								<span>Value</span>
							</div>
							{result.items.map(item => {
								const observed = stats.totalKills > 0 ? item.drops / stats.totalKills : 0;
								const firsts = [...item.firstDropKills].sort((a, b) => a - b);
								const firstMedian = firsts.length > 0 ? median(firsts) : null;
								return (
									<div className="ss-lootsim-row" key={item.serverId}>
										<ItemSprite serverId={item.serverId} size={32} />
										<span className="ss-lootsim-name">{item.name}</span>
										<span className="mono">{Math.round(item.total / result.sessions).toLocaleString()}</span>
										<span
											className="mono"
											title={`Dropped on ${item.drops.toLocaleString()} of ${stats.totalKills.toLocaleString()} kills`}
										>
											{percentText(observed * 100000)}
											<span className="ss-lootsim-vs"> vs {percentText(Math.min(item.configured, 1) * 100000)}</span>
										</span>
										<span
											className="mono"
											title={
												firstMedian !== null
													? `Median first drop: kill ${Math.round(firstMedian)}; dropped in ${item.firstDropKills.length} of ${result.sessions} sessions`
													: 'Never dropped'
											}
										>
											{firstMedian === null ? (
												'—'
											) : timeMode ? (
												<>
													{duration(firstMedian * cadence)}
													<span className="ss-lootsim-vs"> k{Math.round(firstMedian)}</span>
												</>
											) : (
												// No clock in kill mode — the kill index is the whole answer.
												<>kill {Math.round(firstMedian).toLocaleString()}</>
											)}
										</span>
										<span className="mono">
											{item.priced ? (
												<>
													{gp(item.gp / result.sessions)}
													{stats.meanGp > 0 && (
														<span className="ss-lootsim-vs"> {Math.round((item.gp / result.sessions / stats.meanGp) * 100)}%</span>
													)}
												</>
											) : (
												<span className="ss-lootsim-vs">unpriced</span>
											)}
										</span>
									</div>
								);
							})}
							{result.items.length === 0 && <div className="ss-lootsim-empty">Nothing dropped.</div>}
						</div>
						)}

						{(result.deadEntries > 0 || result.unpricedKinds > 0) && (
							<div className="ss-lootsim-notes">
								{result.deadEntries > 0 && (
									<span>
										{result.deadEntries} {result.deadEntries === 1 ? 'entry' : 'entries'} never drop — see lints.
									</span>
								)}
								{result.unpricedKinds > 0 && (
									<span>
										{result.unpricedKinds} {result.unpricedKinds === 1 ? 'item is' : 'items are'} unpriced and
										excluded from gp totals.
									</span>
								)}
							</div>
						)}
					</>
				)}

				<div className="ss-lootsim-caption">
					Per-session totals are averages over the runs. The model mirrors the documented loader rules; the
					per-entry uniform roll and 1–countmax stack count are inferred from the TFS lineage, not Ironcore
					source.
				</div>

				<div className="ss-modal-buttons">
					<button className="ss-btn ss-btn-ghost" onClick={onClose}>
						Close
					</button>
					<div className="ss-modal-buttons-spacer" />
					<button className="ss-btn ss-btn-primary" disabled={!resolved} onClick={run}>
						<Dices size={14} />
						{resolved ? (result ? 'Simulate again' : 'Simulate') : 'Resolving items…'}
					</button>
				</div>
			</div>
		</div>
	);
}
