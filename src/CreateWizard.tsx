// The create wizard: six questions, each arriving with an answer already in it.
//
// They are asked in the order a monster is imagined rather than the order the
// file is written: what kind of thing it is, what it looks like, what it is
// called, and only then the numbers. Naming comes third because a name is
// easier to accept once there is something on screen to name.
//
// The generator supplies the default answer to every question and the user
// supplies the ones they care about. Accept them all and you get what a
// dice-roll would have given you, except you watched it being made and know
// what is in it; override three and the other three fill themselves in around
// your choices.
//
// Nothing is written until the last click. The wizard's state is a MonsterDoc
// in memory and nothing else, so Escape on step five leaves no scratch file, no
// registry entry and nothing to clean up.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dices, ChevronLeft } from 'lucide-react';
import {
	balanceBands,
	createMonster,
	droppedItemIds,
	getMonster,
	itemUrl,
	lintMonster,
	lookUrl,
	monsterTemplate,
	nextFreeRaceid,
	saveMonster,
	MIN_BAND_N,
	type BalanceBand,
	type ItemIndex,
	type ItemInfo,
	type Lint,
	type MonsterDoc,
	type MonsterSummary,
	type SpellBlock
} from './monster';
import type { EngineInfo } from './engine';
import { EffectSelect } from './fields/EffectSelect';
import { useItemInfo } from './fields/ItemPicker';
import { meleeBlockMax } from './derive';
import { makeRng } from './lootsim';
import { generateName, type NameStyle } from './namegen';
import {
	KINDS,
	defaultBand,
	flagsFor,
	newSeed,
	pickDonors,
	sampleLoot,
	sampleLook,
	sampleMelee,
	sampleSpells,
	sampleStats,
	usableBands,
	type Kind,
	type SampledLoot,
	type SampledSpell,
	type Stats
} from './generate';
import { n as fmt } from './i18n';
import type { Toast } from './App';

interface Props {
	monsters: MonsterSummary[];
	/** Comment groups in monsters.xml, for the registry entry. */
	groups: string[];
	engine: EngineInfo;
	/** Outfit ids from the client, so the look can avoid one already in use. */
	outfitIds: number[];
	itemIndex: ItemIndex;
	/** Fired after the monster is on disk, with the file to select. */
	onCreated: (file: string) => void;
	onClose: () => void;
	showToast: (kind: Toast['kind'], msg: string) => void;
}

/** A ticked proposal — the shape both the spell and loot lists use. */
interface Ticked<T> {
	item: T;
	on: boolean;
}

const STEP_COUNT = 6;

/** Everything the generator can fill in, and therefore everything the `touched`
 *  set has keys for. A field the user has edited is never redrawn under them. */
type Field = 'name' | 'stats' | 'look' | 'race' | 'corpse' | 'melee' | 'spells' | 'loot';

export default function CreateWizard({ monsters, groups, engine, outfitIds, itemIndex, onCreated, onClose, showToast }: Props) {
	const { t } = useTranslation();

	const [step, setStep] = useState(0);
	const [seed, setSeed] = useState(newSeed);
	const [busy, setBusy] = useState(false);

	// A field the user has edited is never re-derived under them. Going back to
	// change the band redraws the stats and leaves a hand-written loot table
	// alone — without that rule the Back button silently eats work, which is what
	// makes people stop trusting it and start over instead.
	const [touched, setTouched] = useState<Set<Field>>(new Set());
	const mark = useCallback((f: Field) => setTouched(prev => (prev.has(f) ? prev : new Set(prev).add(f))), []);

	// One nonce per answer, so ⟳ redraws that answer and leaves the rest of the
	// proposal standing. Bumping the seed instead would redraw every untouched
	// field at once, which makes "draw another name" quietly replace the outfit
	// and the loot table the user was already happy with.
	const [nonce, setNonce] = useState<Record<Field, number>>({ name: 0, stats: 0, look: 0, race: 0, corpse: 0, melee: 0, spells: 0, loot: 0 });

	// ---- Answers ----
	const [name, setName] = useState('');
	const [nameStyle, setNameStyle] = useState<NameStyle>('classic');
	const [file, setFile] = useState('');
	const [group, setGroup] = useState(groups[0] ?? '');
	const [showFile, setShowFile] = useState(false);
	const [kind, setKind] = useState<Kind>('monster');
	const [bandLabel, setBandLabel] = useState<string | null>(null);
	const [stats, setStats] = useState<Stats | null>(null);
	const [look, setLook] = useState({ type: 0, head: 0, body: 0, legs: 0, feet: 0 });
	const [race, setRace] = useState<string | null>(null);
	const [corpse, setCorpse] = useState(0);
	const [melee, setMelee] = useState<SampledSpell | null>(null);
	const [meleeOn, setMeleeOn] = useState(true);
	const [spells, setSpells] = useState<Ticked<SampledSpell>[]>([]);
	const [loot, setLoot] = useState<Ticked<SampledLoot>[]>([]);

	// ---- Corpus ----
	const [bands, setBands] = useState<BalanceBand[]>([]);
	const [dropped, setDropped] = useState<number[]>([]);
	const [donors, setDonors] = useState<MonsterDoc[]>([]);
	const [items, setItems] = useState<Map<number, ItemInfo>>(new Map());
	const [template, setTemplate] = useState<MonsterDoc | null>(null);
	const [raceid, setRaceid] = useState<number | null>(null);
	const [lints, setLints] = useState<Lint[]>([]);

	const takenNames = useMemo(() => new Set(monsters.map(m => m.name.toLowerCase())), [monsters]);
	const corpusNames = useMemo(() => monsters.map(m => m.name), [monsters]);
	const band = useMemo(() => bands.find(b => b.label === bandLabel) ?? null, [bands, bandLabel]);

	// The item database is optional — Canary and BlackTek ship none — and without
	// one there is no way to know an id is real, so the loot step stands down
	// rather than proposing ids it cannot resolve.
	const [hasItems, setHasItems] = useState(true);

	// ---- Load the corpus once ----
	useEffect(() => {
		let live = true;
		void balanceBands()
			.then(b => live && setBands(b))
			.catch(() => undefined);
		void droppedItemIds()
			.then(ids => {
				if (!live) return;
				setDropped(ids);
				setHasItems(ids.length > 0);
			})
			.catch(() => live && setHasItems(false));
		if (engine.raceidAttr) {
			void nextFreeRaceid()
				.then(id => live && setRaceid(id))
				.catch(() => undefined);
		}
		return () => {
			live = false;
		};
	}, [engine.raceidAttr]);

	// ---- The name, and the skeleton it names ----
	const drawName = useCallback(
		(style: NameStyle, withSeed: number) => {
			const drawn = generateName(style, makeRng(withSeed), {
				corpusNames,
				taken: n => takenNames.has(n.toLowerCase())
			});
			if (drawn) {
				setName(drawn);
				setFile(suggestFile(drawn, engine));
			}
		},
		[corpusNames, takenNames, engine]
	);

	useEffect(() => {
		if (!touched.has('name')) drawName(nameStyle, seed + nonce.name);
	}, [drawName, nameStyle, seed, nonce.name, touched]);

	// The skeleton comes from the backend rather than being built here: a second
	// `template()` in TypeScript would have to be kept in step with the Rust one
	// across seven engines, and this is the document the create path itself uses.
	useEffect(() => {
		if (!name) return;
		let live = true;
		void monsterTemplate(name, file || suggestFile(name, engine))
			.then(doc => live && setTemplate(doc))
			.catch(() => undefined);
		return () => {
			live = false;
		};
	}, [name, file, engine]);

	// ---- Band follows kind ----
	useEffect(() => {
		if (bandLabel !== null || bands.length === 0) return;
		setBandLabel(defaultBand(bands, kind)?.label ?? null);
	}, [bands, kind, bandLabel]);

	// ---- Donors follow kind and band ----
	useEffect(() => {
		if (monsters.length === 0) return;
		let live = true;
		const chosen = pickDonors(makeRng(seed ^ 0x5f3a), monsters, band, kind, 3);
		void Promise.all(chosen.map(m => getMonster(m.file).catch(() => null)))
			.then(docs => live && setDonors(docs.filter((d): d is MonsterDoc => d !== null)))
			.catch(() => undefined);
		return () => {
			live = false;
		};
	}, [monsters, band, kind, seed]);

	// ---- Resolve the items the proposals will need ----
	useEffect(() => {
		const ids = new Set<number>();
		for (const donor of donors) {
			for (const entry of donor.loot) if (entry.id !== null) ids.add(entry.id);
			if (donor.look.corpse) ids.add(donor.look.corpse);
		}
		// A bounded slice of the drop pool, for the top-up. Resolving all of it
		// would be one request per id on a corpus that drops thousands.
		for (const id of dropped.slice(0, 200)) ids.add(id);
		if (ids.size === 0) return;
		let live = true;
		void Promise.all([...ids].map(id => itemIndex.get(id).then(info => [id, info] as const).catch(() => [id, null] as const))).then(
			resolved => {
				if (!live) return;
				const map = new Map<number, ItemInfo>();
				for (const [id, info] of resolved) if (info) map.set(id, info);
				setItems(map);
			}
		);
		return () => {
			live = false;
		};
	}, [donors, dropped, itemIndex]);

	// ---- Derive every untouched answer ----
	useEffect(() => {
		if (!band || touched.has('stats')) return;
		setStats(sampleStats(makeRng((seed ^ 0x1234) + nonce.stats), band));
	}, [band, seed, nonce.stats, touched]);

	useEffect(() => {
		if (touched.has('look') || outfitIds.length === 0) return;
		setLook(sampleLook(makeRng((seed ^ 0xa17f) + nonce.look), outfitIds, monsters));
	}, [outfitIds, monsters, seed, nonce.look, touched]);

	useEffect(() => {
		if (donors.length === 0) return;
		const donor = donors[0];
		if (!touched.has('race')) setRace(donor.race ?? engine.races[0] ?? null);
		// Never drawn: a corpse id has to exist in the item database and actually
		// be a corpse, and a donor's is known to be both.
		if (!touched.has('corpse')) setCorpse(donor.look.corpse);
	}, [donors, engine.races, touched]);

	// Melee is its own answer, because it is the one attack a monster either has
	// or does not — the other four are a handful it might.
	useEffect(() => {
		if (touched.has('melee') || donors.length === 0 || !stats) return;
		const drawn = sampleMelee(makeRng((seed ^ 0x33cd) + nonce.melee), donors, stats.health);
		setMelee(drawn);
		setMeleeOn(drawn !== null && kind !== 'critter');
	}, [donors, stats, seed, nonce.melee, kind, touched]);

	useEffect(() => {
		if (touched.has('spells') || donors.length === 0 || !stats) return;
		const drawn = sampleSpells(makeRng((seed ^ 0x77aa) + nonce.spells), donors, stats.health, kind === 'critter' ? 1 : 4);
		setSpells(drawn.map(item => ({ item, on: true })));
	}, [donors, stats, seed, nonce.spells, kind, touched]);

	useEffect(() => {
		if (touched.has('loot') || donors.length === 0 || !hasItems) return;
		if (kind === 'critter') {
			setLoot([]);
			return;
		}
		const drawn = sampleLoot(makeRng((seed ^ 0xbee5) + nonce.loot), donors, dropped, items, 5);
		setLoot(drawn.map(item => ({ item, on: true })));
	}, [donors, dropped, items, seed, nonce.loot, kind, hasItems, touched]);

	// ---- The document, assembled ----
	const assemble = useCallback(
		(base: MonsterDoc): MonsterDoc => {
			const donor = donors[0];
			return {
				...base,
				name,
				nameDescription: `a ${name.toLowerCase()}`,
				race: race ?? base.race,
				raceid: engine.raceidAttr ? raceid : base.raceid,
				experience: stats?.experience ?? base.experience,
				speed: stats?.speed ?? base.speed,
				health: { now: stats?.health ?? base.health.max, max: stats?.health ?? base.health.max },
				defenseStats: { armor: stats?.armor ?? 0, defense: stats?.defense ?? 0 },
				look: { ...base.look, ...look, corpse },
				flags: { ...base.flags, ...flagsFor(engine, kind) },
				// Copied from the donor rather than composed: the correlation between
				// `undead` and death immunity is a fact about this corpus, and copying
				// it gets it right without asserting it.
				immunities: donor ? { ...donor.immunities } : base.immunities,
				elements: donor ? { ...donor.elements } : base.elements,
				attacks: [...(meleeOn && melee ? [melee.block] : []), ...spells.filter(s => s.on).map(s => s.item.block)],
				loot: loot.filter(l => l.on).map(l => l.item.entry)
			};
		},
		[donors, name, race, raceid, engine, stats, look, corpse, kind, melee, meleeOn, spells, loot]
	);

	const draft = useMemo(() => (template ? assemble(template) : null), [template, assemble]);

	// ---- Lint what is proposed, as it is proposed ----
	useEffect(() => {
		if (!draft) return;
		let live = true;
		const timer = setTimeout(() => {
			void lintMonster(draft)
				.then(found => live && setLints(found))
				.catch(() => undefined);
		}, 250);
		return () => {
			live = false;
			clearTimeout(timer);
		};
	}, [draft]);

	const loud = lints.filter(l => l.severity === 'error' || l.severity === 'silent');

	// ---- Navigation ----
	const lootStep = hasItems && kind !== 'critter';
	const lastStep = STEP_COUNT - 1;
	const NAME_STEP = 2;
	const canAdvance = step !== NAME_STEP || name.trim().length > 0;

	// The loot step is always reached, even when it has nothing to offer — it says
	// why instead of listing ids it cannot vouch for. Skipping it outright would
	// strand the user on step five, where the primary button is still "Next".
	const next = useCallback(() => setStep(s => Math.min(lastStep, s + 1)), [lastStep]);

	const back = useCallback(() => setStep(s => Math.max(0, s - 1)), []);

	const commit = useCallback(async () => {
		const trimmed = name.trim();
		if (!trimmed) return;
		setBusy(true);
		try {
			// Two writes where one would do, deliberately: `create_monster` owns the
			// name collision check and the registry entry, and forking a second copy
			// of that to save one write would mean keeping the two in step forever.
			const created = await createMonster(trimmed, file.trim() || suggestFile(trimmed, engine), group);
			await saveMonster({ ...assemble(created), file: created.file, registered: created.registered });
			showToast('ok', t('Created {{file}}', { file: created.file }));
			onCreated(created.file);
		} catch (e) {
			showToast('error', String(e));
		} finally {
			setBusy(false);
		}
	}, [name, file, group, engine, assemble, showToast, onCreated, t]);

	const createBlank = useCallback(async () => {
		const trimmed = name.trim();
		if (!trimmed) return;
		setBusy(true);
		try {
			const created = await createMonster(trimmed, file.trim() || suggestFile(trimmed, engine), group);
			showToast('ok', t('Created {{file}}', { file: created.file }));
			onCreated(created.file);
		} catch (e) {
			showToast('error', String(e));
		} finally {
			setBusy(false);
		}
	}, [name, file, group, engine, showToast, onCreated, t]);

	// Enter advances, Escape leaves. Both are on the modal rather than on the
	// window: the shell's own dispatcher stands down while a `.ss-backdrop` is up,
	// and this must not outlive the dialog either.
	const onKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				onClose();
				return;
			}
			if (e.key !== 'Enter' || e.shiftKey) return;
			// A button under focus owns its own Enter.
			if ((e.target as HTMLElement).tagName === 'BUTTON') return;
			e.preventDefault();
			if (step === lastStep) void commit();
			else if (canAdvance) next();
		},
		[onClose, step, lastStep, canAdvance, commit, next]
	);

	const nameRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (step === NAME_STEP) nameRef.current?.focus();
	}, [step]);

	const reseed = () => setSeed(newSeed());

	/** Redraws one answer: out of `touched` so the generator owns it again, and on
	 *  to the next nonce so it draws something different. */
	const redraw = (f: Field) => {
		setTouched(prev => {
			if (!prev.has(f)) return prev;
			const nextSet = new Set(prev);
			nextSet.delete(f);
			return nextSet;
		});
		setNonce(prev => ({ ...prev, [f]: prev[f] + 1 }));
	};

	const usable = usableBands(bands);
	const bandIndex = band ? bands.indexOf(band) : 0;

	return (
		<div className="ss-backdrop" onMouseDown={onClose}>
			<div className="ss-modal mx-wiz" onMouseDown={e => e.stopPropagation()} onKeyDown={onKeyDown}>
				<div className="ss-modal-title">
					{t('New monster')}
					<span className="mx-wiz-steps">
						{[...Array(STEP_COUNT)].map((_, i) => (
							<span key={i} className={i === step ? 'mx-wiz-dot mx-wiz-dot-on' : 'mx-wiz-dot'} />
						))}
					</span>
				</div>

				<div className="mx-wiz-body">
					<div className="mx-wiz-main">
						{step === 0 && (
							<Step question={t('What kind of monster is it?')}>
								<div className="mx-wiz-kinds">
									{KINDS.map(k => (
										<button
											key={k.key}
											className={kind === k.key ? 'mx-wiz-kind mx-wiz-kind-on' : 'mx-wiz-kind'}
											onClick={() => {
												setKind(k.key);
												setBandLabel(defaultBand(bands, k.key)?.label ?? null);
											}}
										>
											<span className="mx-wiz-kind-label">{t(k.label)}</span>
											<span className="mx-wiz-kind-blurb">{t(k.blurb)}</span>
										</button>
									))}
								</div>
								<div className="ss-modal-desc">
									{t('This is the only question with no drawn answer — it picks which monsters everything else is drawn from.')}
								</div>
							</Step>
						)}

						{step === 1 && (
							<Step question={t('What does it look like?')}>
								<div className="mx-wiz-look">
									<img className="mx-wiz-sprite" src={lookUrl({ ...blankLook, ...look, mode: 'type' }, { cell: 64 })} alt="" />
									<img
										className="mx-wiz-sprite"
										src={itemUrl(corpse, 64)}
										alt=""
										// No corpse, or one the database cannot draw: an empty tile
										// rather than the browser's broken-image glyph.
										onError={e => (e.currentTarget.style.visibility = 'hidden')}
										onLoad={e => (e.currentTarget.style.visibility = 'visible')}
									/>
									<div className="mx-wiz-fields">
										<label className="mx-wiz-field">
											<span>{t('Outfit')}</span>
											<input
												className="mx-wiz-input mono"
												type="number"
												value={look.type}
												onChange={e => {
													mark('look');
													setLook({ ...look, type: Number(e.target.value) });
												}}
											/>
										</label>
										<label className="mx-wiz-field">
											<span>{t('Corpse')}</span>
											<input
												className="mx-wiz-input mono"
												type="number"
												value={corpse}
												onChange={e => {
													mark('corpse');
													setCorpse(Number(e.target.value));
												}}
											/>
										</label>
										<label className="mx-wiz-field">
											<span>{t('Race')}</span>
											<select
												className="mx-wiz-input"
												value={race ?? ''}
												onChange={e => {
													mark('race');
													setRace(e.target.value || null);
												}}
											>
												{engine.races.map(r => (
													<option key={r} value={r}>
														{r}
													</option>
												))}
											</select>
										</label>
									</div>
									<button className="ss-btn ss-btn-ghost mx-wiz-redraw" title={t('Draw another')} onClick={() => redraw('look')}>
										<Dices size={14} />
									</button>
								</div>
								{/* Two grids, side by side, because both answers are pictures. The
								    corpse used to be a number field beside an outfit you could see,
								    which asked the user to know that 5972 is a dead orc. */}
								<div className="mx-wiz-pickers">
									{outfitIds.length > 0 && (
										<OutfitPicker
											ids={outfitIds}
											look={look}
											onPick={id => {
												mark('look');
												setLook({ ...look, type: id });
											}}
										/>
									)}
									<CorpsePicker
										index={itemIndex}
										value={corpse}
										onPick={id => {
											mark('corpse');
											setCorpse(id);
										}}
									/>
								</div>
								<div className="ss-modal-desc">
									{outfitIds.length === 0
										? t('No client is open, so there is nothing to draw — the outfit is an id, and the server will resolve it.')
										: t('The outfit is one no monster in this corpus wears. The corpse is a donor’s, so the item database can resolve it.')}
								</div>
							</Step>
						)}

						{step === 2 && (
							<Step question={t('What is it called?')}>
								<div className="mx-wiz-row">
									<input
										ref={nameRef}
										className="mx-wiz-input mx-wiz-name"
										value={name}
										onChange={e => {
											mark('name');
											setName(e.target.value);
											setFile(suggestFile(e.target.value, engine));
										}}
										placeholder={t('Name')}
									/>
									<button className="ss-btn ss-btn-ghost mx-wiz-redraw" title={t('Draw another')} onClick={() => redraw('name')}>
										<Dices size={14} />
									</button>
								</div>
								<div className="mx-wiz-styles">
									{(['classic', 'corpus'] as NameStyle[]).map(s => (
										<label key={s} className="mx-wiz-style">
											<input
												type="radio"
												checked={nameStyle === s}
												onChange={() => {
													setNameStyle(s);
													redraw('name');
												}}
											/>
											{s === 'classic' ? t('Classic') : t('Corpus style')}
										</label>
									))}
								</div>
								<div className="ss-modal-desc">
									{nameStyle === 'classic'
										? t('Drawn from the generator’s own word tables.')
										: t('Built from the names this corpus already uses.')}
								</div>

								<button className="ss-btn ss-btn-ghost mx-wiz-disclose" onClick={() => setShowFile(v => !v)}>
									{showFile ? t('Hide file and group') : t('File and group')}
								</button>
								{showFile && (
									<div className="mx-wiz-fields">
										<label className="mx-wiz-field">
											<span>{t('File')}</span>
											<input className="mx-wiz-input" value={file} onChange={e => setFile(e.target.value)} />
										</label>
										<label className="mx-wiz-field">
											<span>{t('Group')}</span>
											<select className="mx-wiz-input" value={group} onChange={e => setGroup(e.target.value)}>
												<option value="">{t('(none)')}</option>
												{groups.map(g => (
													<option key={g} value={g}>
														{g}
													</option>
												))}
											</select>
										</label>
									</div>
								)}
							</Step>
						)}

						{step === 3 && (
							<Step question={t('How much is a kill worth?')}>
								{bands.length === 0 ? (
									<div className="ss-modal-desc">{t('This corpus has no experience bands to draw from — type the figures yourself.')}</div>
								) : (
									<>
										<input
											type="range"
											className="mx-wiz-slider"
											min={0}
											max={bands.length - 1}
											value={bandIndex}
											onChange={e => setBandLabel(bands[Number(e.target.value)]?.label ?? null)}
										/>
										<div className="mx-wiz-band">
											<strong>{band?.label ?? '—'}</strong>
											<span className={band && band.count < MIN_BAND_N ? 'mx-wiz-thin' : undefined}>
												{band
													? band.count < MIN_BAND_N
														? t('{{count}} monsters — too few to draw a norm from', { count: band.count })
														: t('{{count}} monsters', { count: band.count })
													: ''}
											</span>
										</div>
									</>
								)}
								<div className="mx-wiz-stats">
									{stats &&
										(
											[
												['experience', t('Experience')],
												['health', t('Health')],
												['speed', t('Speed')],
												['armor', t('Armor')],
												['defense', t('Defense')]
											] as const
										).map(([key, label]) => (
											<label key={key} className="mx-wiz-field">
												<span>{label}</span>
												<input
													className="mx-wiz-input mono"
													type="number"
													value={stats[key]}
													onChange={e => {
														mark('stats');
														setStats({ ...stats, [key]: Number(e.target.value) });
													}}
												/>
											</label>
										))}
								</div>
								{stats && band && usable.length > 0 && (
									<div className="ss-modal-desc">
										{t('Read off the band at its {{p}}th percentile.', { p: stats.percentile })}{' '}
										<button className="ss-btn ss-btn-ghost ss-ed-mini" onClick={() => redraw('stats')}>
											{t('Draw again')}
										</button>
									</div>
								)}
							</Step>
						)}

						{step === 4 && (
							<Step question={t('How does it fight?')}>
								{/* Melee is asked first and asked as a yes or no, because it is the
								    one attack a monster either has or does not. Its damage is not a
								    number you write: the loader derives it from skill and attack, so
								    those are the two fields and the derived figure is shown beside
								    them rather than being editable and ignored. */}
								<label className={melee ? 'mx-wiz-melee' : 'mx-wiz-melee mx-wiz-item-off'}>
									<input
										type="checkbox"
										checked={meleeOn && melee !== null}
										disabled={melee === null}
										onChange={() => {
											mark('melee');
											setMeleeOn(v => !v);
										}}
									/>
									<span className="mx-wiz-item-name">{t('Fights in melee')}</span>
									{melee && <span className="mx-wiz-item-from">{t('from {{name}}', { name: melee.from })}</span>}
								</label>
								{melee === null && (
									<div className="ss-modal-desc">{t('No donor in this band fights in melee, so there is no block to copy.')}</div>
								)}
								{melee && meleeOn && (
									<div className="mx-wiz-fields mx-wiz-melee-fields">
										<label className="mx-wiz-field">
											<span>{t('Skill')}</span>
											<input
												className="mx-wiz-input mono"
												type="number"
												min={0}
												value={melee.block.melee?.skill ?? 0}
												onChange={e => {
													mark('melee');
													setMelee(setMeleeField(melee, 'skill', Number(e.target.value)));
												}}
											/>
										</label>
										<label className="mx-wiz-field">
											<span>{t('Attack')}</span>
											<input
												className="mx-wiz-input mono"
												type="number"
												min={0}
												value={melee.block.melee?.attack ?? 0}
												onChange={e => {
													mark('melee');
													setMelee(setMeleeField(melee, 'attack', Number(e.target.value)));
												}}
											/>
										</label>
										<div className="mx-wiz-field">
											<span>{t('Max damage')}</span>
											<span className="mono mx-wiz-derived">{meleeBlockMax(melee.block) ?? '—'}</span>
										</div>
									</div>
								)}

								<div className="mx-wiz-sub">{t('Spells')}</div>
								{spells.length === 0 && <div className="ss-modal-desc">{t('No spells drawn — the donors have none to lend.')}</div>}
								<div className="mx-wiz-cards">
									{spells.map((s, i) => {
										const block = s.item.block;
										const edit = (patch: Partial<SpellBlock>) => {
											mark('spells');
											setSpells(spells.map((x, j) => (j === i ? { ...x, item: { ...x.item, block: { ...x.item.block, ...patch } } } : x)));
										};
										return (
											<div key={i} className={s.on ? 'mx-wiz-card' : 'mx-wiz-card mx-wiz-item-off'}>
												<label className="mx-wiz-card-head">
													<input
														type="checkbox"
														checked={s.on}
														onChange={() => {
															mark('spells');
															setSpells(spells.map((x, j) => (j === i ? { ...x, on: !x.on } : x)));
														}}
													/>
													<span className="mx-wiz-item-name">{block.name ?? block.script ?? t('script')}</span>
													<span className="mx-wiz-item-from">{t('from {{name}}', { name: s.item.from })}</span>
												</label>
												{s.on && (
													<div className="mx-wiz-card-body">
														<label className="mx-wiz-field">
															<span>{t('Min damage')}</span>
															<input
																className="mx-wiz-input mono"
																type="number"
																value={block.min}
																onChange={e => edit({ min: Number(e.target.value) })}
															/>
														</label>
														<label className="mx-wiz-field">
															<span>{t('Max damage')}</span>
															<input
																className="mx-wiz-input mono"
																type="number"
																value={block.max}
																onChange={e => edit({ max: Number(e.target.value) })}
															/>
														</label>
														{/* A registered spell carries its own effects and the loader
														    ignores anything written here, so the pickers stand down
														    rather than offering a choice with no consequence. */}
														{block.kind === 'builtin' && (
															<>
																<label className="mx-wiz-field">
																	<span>{t('Effect')}</span>
																	<EffectSelect
																		kind="area"
																		engine={engine.key}
																		value={block.effects.areaEffect}
																		onChange={v => edit({ effects: { ...block.effects, areaEffect: v } })}
																	/>
																</label>
																<label className="mx-wiz-field">
																	<span>{t('Shoot effect')}</span>
																	<EffectSelect
																		kind="shoot"
																		engine={engine.key}
																		value={block.effects.shootEffect}
																		onChange={v => edit({ effects: { ...block.effects, shootEffect: v } })}
																	/>
																</label>
															</>
														)}
													</div>
												)}
											</div>
										);
									})}
								</div>
								<button className="ss-btn ss-btn-ghost ss-ed-mini" onClick={() => redraw('spells')}>
									{t('Draw again')}
								</button>
							</Step>
						)}

						{step === 5 && lootStep && (
							<Step question={t('What does it drop?')}>
								<div className="mx-wiz-list">
									{loot.map((l, i) => (
										<label key={i} className={l.on ? 'mx-wiz-item' : 'mx-wiz-item mx-wiz-item-off'}>
											<input
												type="checkbox"
												checked={l.on}
												onChange={() => {
													mark('loot');
													setLoot(loot.map((x, j) => (j === i ? { ...x, on: !x.on } : x)));
												}}
											/>
											{l.item.entry.id !== null && <img className="mx-wiz-item-icon" src={itemUrl(l.item.entry.id, 32)} alt="" />}
											<span className="mx-wiz-item-name">
												{items.get(l.item.entry.id ?? -1)?.name ?? l.item.entry.comment ?? `#${l.item.entry.id}`}
											</span>
											<span className="mono mx-wiz-item-num">{(l.item.entry.chance / 1000).toFixed(2)}%</span>
											<span className="mx-wiz-item-from">{t('from {{name}}', { name: l.item.from })}</span>
										</label>
									))}
								</div>
								<button className="ss-btn ss-btn-ghost ss-ed-mini" onClick={() => redraw('loot')}>
									{t('Draw again')}
								</button>
							</Step>
						)}

						{step === 5 && !lootStep && (
							<Step question={t('What does it drop?')}>
								<div className="ss-modal-desc">
									{kind === 'critter'
										? t('Critters drop nothing. Add loot in the editor if this one should.')
										: t('No item database is open, so there is no way to tell a real item id from an invented one. Add loot in the editor.')}
								</div>
							</Step>
						)}
					</div>

					{/* The review rail. Live from the moment there are stats to show. */}
					<aside className="mx-wiz-side">
						<img className="mx-wiz-sprite" src={lookUrl({ ...blankLook, ...look, mode: 'type' }, { cell: 64 })} alt="" />
						<div className="mx-wiz-side-name">{name || t('(unnamed)')}</div>
						{stats && (
							<div className="mono mx-wiz-side-stats">
								{fmt(stats.health)} hp · {fmt(stats.speed)} {t('speed')}
								<br />
								{fmt(stats.armor)} {t('armor')} · {fmt(stats.defense)} {t('defense')}
								<br />
								{fmt(stats.experience)} {t('exp')}
							</div>
						)}
						<div className="mx-wiz-prov">
							<div className="mx-wiz-prov-title">{t('Drawn from')}</div>
							{band && (
								<div>
									{t('stats')}: {band.label} ({fmt(band.count)})
								</div>
							)}
							{donors.length > 0 && (
								<div>
									{t('donors')}: {donors.map(d => d.name).join(', ')}
								</div>
							)}
							{!touched.has('look') && <div>{t('look')}: {t('unused outfit {{id}}', { id: look.type })}</div>}
						</div>
						<div className={loud.length > 0 ? 'mx-wiz-lints mx-wiz-lints-bad' : 'mx-wiz-lints'}>
							{loud.length === 0 ? t('No lint findings') : t('{{count}} findings', { count: loud.length })}
						</div>
						{loud.slice(0, 3).map((l, i) => (
							<div key={i} className="mx-wiz-lint">
								{l.message}
							</div>
						))}
					</aside>
				</div>

				<div className="ss-modal-buttons">
					{step > 0 && (
						<button className="ss-btn ss-btn-ghost" onClick={back}>
							<ChevronLeft size={14} /> {t('Back')}
						</button>
					)}
					{/* The old dialog's whole job, one button in: a name, a file and an
					    empty document. It lives on the name step because that is where the
					    name is, and the name is all it needs. */}
					{step === NAME_STEP && (
						<button className="ss-btn ss-btn-ghost" disabled={busy || !canAdvance} onClick={() => void createBlank()}>
							{t('Create blank')}
						</button>
					)}
					<div className="ss-modal-buttons-spacer" />
					<button className="ss-btn ss-btn-ghost" onClick={onClose}>
						{t('Cancel')}
					</button>
					{step < lastStep ? (
						<button className="ss-btn ss-btn-primary" disabled={!canAdvance} onClick={next}>
							{t('Next')}
						</button>
					) : (
						<button className="ss-btn ss-btn-primary" disabled={busy || !canAdvance} onClick={() => void commit()}>
							{busy ? t('Creating…') : t('Create monster')}
						</button>
					)}
				</div>
				<div className="ss-modal-desc mx-wiz-seed">
					{t('Seed')} <span className="mono">{seed}</span>{' '}
					<button className="ss-btn ss-btn-ghost ss-ed-mini" onClick={reseed}>
						{t('Draw everything again')}
					</button>
				</div>
			</div>
		</div>
	);
}

const CELL = 40;
const GRID_COLS = 6;
const GRID_VIEW = 176;

/** One cell of a sprite grid: what to draw, what to call it, and what picking
 *  it means. */
interface Cell {
	id: number;
	title: string;
	src: string;
}

/**
 * A windowed grid of sprite cells, shared by the outfit and corpse pickers.
 *
 * Windowed on whole rows because every cell is its own protocol request: a
 * client ships thousands of outfits and a server's database thousands of items,
 * and asking for all of them to fill a 176-pixel box would be thousands of PNG
 * renders for the twenty-four that are on screen.
 */
function SpriteGrid({ cells, active, onPick }: { cells: Cell[]; active: number; onPick: (id: number) => void }) {
	const [scrollTop, setScrollTop] = useState(0);
	const scrollRef = useRef<HTMLDivElement>(null);

	const rows = Math.ceil(cells.length / GRID_COLS);
	const first = Math.max(0, Math.floor(scrollTop / CELL) - 2);
	const last = Math.min(rows - 1, Math.ceil((scrollTop + GRID_VIEW) / CELL) + 2);

	// Bring the current cell into view — on arrival at the step, and again
	// whenever ⟳ draws a different one, or the grid shows a screenful with the
	// chosen one nowhere among them.
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const idx = cells.findIndex(c => c.id === active);
		if (idx < 0) return;
		const top = Math.floor(idx / GRID_COLS) * CELL;
		if (top < el.scrollTop || top + CELL > el.scrollTop + el.clientHeight) {
			el.scrollTop = Math.max(0, top - (el.clientHeight - CELL) / 2);
		}
	}, [cells, active]);

	const drawn: React.ReactNode[] = [];
	for (let row = first; row <= last; row++) {
		for (let col = 0; col < GRID_COLS; col++) {
			const cell = cells[row * GRID_COLS + col];
			if (!cell) break;
			drawn.push(
				<button
					key={cell.id}
					type="button"
					className={cell.id === active ? 'mx-wiz-outfit mx-wiz-outfit-on' : 'mx-wiz-outfit'}
					style={{ top: row * CELL, left: col * CELL }}
					title={cell.title}
					onClick={() => onPick(cell.id)}
				>
					{/* An id the client or the database cannot draw reads as an empty
					    tile rather than as the browser's broken-image glyph. */}
					<img src={cell.src} alt="" onError={e => (e.currentTarget.style.visibility = 'hidden')} />
				</button>
			);
		}
	}

	return (
		<div className="mx-wiz-outfit-grid" ref={scrollRef} style={{ height: GRID_VIEW }} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
			<div style={{ height: rows * CELL, width: GRID_COLS * CELL, position: 'relative' }}>{drawn}</div>
		</div>
	);
}

/**
 * Every outfit the client has, drawn in the colours the wizard drew — the
 * generator picks an id no monster in the corpus wears, and this is where that
 * proposal is either accepted or overruled by eye. Typing an id still works;
 * the grid is for the far commoner case of not knowing which number is the
 * thing you can picture.
 */
function OutfitPicker({
	ids,
	look,
	onPick
}: {
	ids: number[];
	look: { type: number; head: number; body: number; legs: number; feet: number };
	onPick: (id: number) => void;
}) {
	const { t } = useTranslation();
	const [search, setSearch] = useState('');

	const cells = useMemo(() => {
		const needle = search.trim();
		const shown = needle ? ids.filter(id => String(id).includes(needle)) : ids;
		return shown.map(id => ({
			id,
			title: String(id),
			src: lookUrl({ ...blankLook, ...look, mode: 'type', type: id }, { cell: 32 })
		}));
	}, [ids, search, look]);

	return (
		<div className="mx-wiz-outfits">
			<div className="mx-wiz-pick-head">{t('Outfit')}</div>
			<input
				className="mx-wiz-input mx-wiz-outfit-search"
				value={search}
				placeholder={t('Filter by outfit id')}
				onChange={e => setSearch(e.target.value)}
			/>
			<SpriteGrid cells={cells} active={look.type} onPick={onPick} />
		</div>
	);
}

/** How many corpses one search fills the grid with. Above what anyone scrolls
 *  through, and the search box is how you get past it. */
const CORPSE_LIMIT = 300;

/**
 * The same grid, over the item database's corpses.
 *
 * The corpse was the one answer on this step that was still a number field
 * beside an outfit you could see, which asked the user to know that 5972 is a
 * dead orc. It is an item like any other, so it is picked like one: `search`
 * already takes the corpse filter the editor's own `ItemPicker` uses, and every
 * id it returns is one the database resolves — which is what keeps the rule
 * that MONx never invents an item id.
 *
 * The filter asks for `corpseType`, an attribute only some item databases carry.
 * Where none do it would filter every item away, so an empty result on the first
 * search turns the filter off rather than showing an empty grid: an unfiltered
 * database is a worse picker, but a blank one is a broken picker.
 */
function CorpsePicker({ index, value, onPick }: { index: ItemIndex; value: number; onPick: (id: number) => void }) {
	const { t } = useTranslation();
	const [query, setQuery] = useState('');
	const [corpsesOnly, setCorpsesOnly] = useState(true);
	const [rows, setRows] = useState<ItemInfo[]>([]);
	const [searched, setSearched] = useState(false);
	const current = useItemInfo(index, value || null, null);

	useEffect(() => {
		let live = true;
		const timer = setTimeout(() => {
			void index
				.search(query, CORPSE_LIMIT, corpsesOnly)
				.then(found => {
					if (!live) return;
					if (found.length === 0 && corpsesOnly && !query.trim()) {
						setCorpsesOnly(false);
						return;
					}
					setRows(found);
					setSearched(true);
				})
				.catch(() => undefined);
		}, 120);
		return () => {
			live = false;
			clearTimeout(timer);
		};
	}, [index, query, corpsesOnly]);

	const cells = useMemo(
		() => rows.map(item => ({ id: item.serverId, title: `${item.name} · ${item.serverId}`, src: itemUrl(item.serverId, 32) })),
		[rows]
	);

	return (
		<div className="mx-wiz-outfits">
			<div className="mx-wiz-pick-head">
				{t('Corpse')}
				{current && <span className="mx-wiz-pick-name">{current.name}</span>}
			</div>
			<input
				className="mx-wiz-input mx-wiz-outfit-search"
				value={query}
				placeholder={corpsesOnly ? t('Search corpses…') : t('Search items…')}
				onChange={e => setQuery(e.target.value)}
			/>
			{cells.length === 0 && searched ? <div className="mx-wiz-pick-empty">{t('No match')}</div> : <SpriteGrid cells={cells} active={value} onPick={onPick} />}
		</div>
	);
}

function Step({ question, children }: { question: string; children: React.ReactNode }) {
	return (
		<div className="mx-wiz-step">
			<h3 className="mx-wiz-q">{question}</h3>
			{children}
		</div>
	);
}

/** The look fields `lookUrl` needs that the wizard does not ask about. */
const blankLook = {
	mode: 'type' as const,
	type: 0,
	head: 0,
	body: 0,
	legs: 0,
	feet: 0,
	addons: 0,
	mount: 0,
	typeex: null,
	corpse: 0,
	corpseactionid: 0
};

/** One field of a melee block, with the block and its provenance carried
 *  through — the melee sub-object is always present on a block the sampler
 *  chose, because that is what made it melee. */
function setMeleeField(sampled: SampledSpell, key: 'skill' | 'attack', value: number): SampledSpell {
	const block = sampled.block;
	// A donated melee block usually carries the sub-object already. Nostalrius's
	// bare `<attacks>` melee does not, and the loader only derives damage when
	// both attributes are written — so the first edit writes both, the same
	// materialisation the editor's own spell card does.
	const melee = block.melee ?? {
		skill: 0,
		attack: 0,
		condition: null,
		skillfactor: null,
		skillnextlevel: null,
		skilladdcount: null,
		poisoncycles: null
	};
	return { ...sampled, block: { ...block, melee: { ...melee, [key]: value } } };
}

/** The corpus convention: lower case, no spaces. Matches the list's own
 *  suggestion, and the Lua engines take `.lua`. */
function suggestFile(name: string, engine: EngineInfo): string {
	const stem = name.toLowerCase().replace(/[^a-z0-9]/g, '');
	const lua = engine.key === 'canary' || engine.key === 'crystal' || engine.key === 'blacktek';
	return stem ? `${stem}.${lua ? 'lua' : 'xml'}` : '';
}
