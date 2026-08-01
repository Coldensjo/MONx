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
import { Dices, ChevronLeft, Plus } from 'lucide-react';
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
	type SpellBlock,
	type SpellName
} from './monster';
import { engineInfo, type EngineInfo } from './engine';
import { useItemInfo } from './fields/ItemPicker';
import { useCustomEffects } from './fields/customctx';
import { mergeEffects } from './customeffects';
import { SpellCard } from './sections/SpellCard';
import { blankSpell } from './sections/Spells';
import { meleeBlockMax } from './derive';
import { makeRng } from './lootsim';
import { generateName, type NameStyle } from './namegen';
import {
	KINDS,
	defaultBand,
	flagsFor,
	newSeed,
	pickDonors,
	pickMelee,
	sampleLoot,
	sampleLook,
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
	/** Set while the workspace's own browser is being used to answer a question.
	 *  The wizard stays mounted — everything answered so far is in its state and
	 *  a round trip to the outfit grid must not cost the user any of it. */
	hidden?: boolean;
	/** Hands the question to the browser the sidebar opens. */
	onBrowse: (kind: PickKind) => void;
	/** The cell the user clicked over there, on its way back. */
	picked: { kind: PickKind; id: number } | null;
	onPickUsed: () => void;
	monsters: MonsterSummary[];
	/** Comment groups in monsters.xml, for the registry entry. */
	groups: string[];
	engine: EngineInfo;
	/** Outfit ids from the client, so the look can avoid one already in use. */
	outfitIds: number[];
	itemIndex: ItemIndex;
	/** The spell catalogue, so the ability designer offers this server's own
	 *  registered spells beside the engine's built-ins. */
	spellNames: SpellName[];
	/** Fired after the monster is on disk, with the file to select. */
	onCreated: (file: string) => void;
	onClose: () => void;
	showToast: (kind: Toast['kind'], msg: string) => void;
}

/** The questions this wizard hands to the workspace's own browsers. Every one
 *  of them is a picture, which is why none of them is answered in here. */
export type PickKind = 'outfit' | 'corpse' | 'effect' | 'missile';

/** A ticked proposal — the shape both the spell and loot lists use. */
interface Ticked<T> {
	item: T;
	on: boolean;
}

const STEP_COUNT = 6;

/** Everything the generator can fill in, and therefore everything the `touched`
 *  set has keys for. A field the user has edited is never redrawn under them. */
type Field = 'name' | 'stats' | 'look' | 'race' | 'corpse' | 'melee' | 'loot';

export default function CreateWizard({
	hidden,
	onBrowse,
	picked,
	onPickUsed,
	monsters,
	groups,
	engine,
	outfitIds,
	itemIndex,
	spellNames,
	onCreated,
	onClose,
	showToast
}: Props) {
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
	const [nonce, setNonce] = useState<Record<Field, number>>({ name: 0, stats: 0, look: 0, race: 0, corpse: 0, melee: 0, loot: 0 });

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
	/** The abilities the user designed. Nothing is drawn into this: a monster's
	 *  kit is the one part of it nobody wants handed to them, and a sampled spell
	 *  is one you have to read before you can trust it. */
	const [abilities, setAbilities] = useState<SpellBlock[]>([]);
	/** Which ability the designer has open. One at a time: the rail above it
	 *  carries the whole kit, and five open cards is a page, not a question. */
	const [active, setActive] = useState(0);
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

	const custom = useCustomEffects();

	// The corpse by name, because an id is not something anyone reads.
	const corpseInfo = useItemInfo(itemIndex, corpse || null, null);

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
	// or does not — the abilities are a handful it might. Taken off the nearest
	// donor rather than drawn, so the numbers in front of the user are numbers
	// this server already fights with, and the same band opens the same way
	// twice running.
	useEffect(() => {
		if (touched.has('melee') || donors.length === 0 || !stats) return;
		const found = pickMelee(donors, stats.health);
		setMelee(found);
		setMeleeOn(found !== null && kind !== 'critter');
	}, [donors, stats, kind, touched]);

	useEffect(() => {
		if (touched.has('loot') || donors.length === 0 || !hasItems) return;
		if (kind === 'critter') {
			setLoot([]);
			return;
		}
		const drawn = sampleLoot(makeRng((seed ^ 0xbee5) + nonce.loot), donors, dropped, items, 5);
		setLoot(drawn.map(item => ({ item, on: true })));
	}, [donors, dropped, items, seed, nonce.loot, kind, hasItems, touched]);

	const openIndex = Math.min(active, Math.max(0, abilities.length - 1));
	const open = abilities[openIndex] ?? null;

	// Where an ability's lints sit in the document being linted: melee, when it
	// is on, is `attacks[0]`.
	const abilityOffset = meleeOn && melee ? 1 : 0;

	/** A new ability opens on the commonest direct-damage spell in the engine's
	 *  own catalogue. A starting position, not a proposal — the designer's first
	 *  field is which spell this is, and changing it reshapes everything under
	 *  it. */
	const addAbility = useCallback(() => {
		setAbilities(prev => {
			setActive(prev.length);
			return [...prev, { ...blankSpell('attacks'), name: 'physical', range: 4, melee: null }];
		});
	}, []);

	// A cell clicked in the browser lands here on the way back. Marked touched,
	// like any other answer the user gave with their own hands: the generator
	// must not redraw it when they step back and change the band.
	useEffect(() => {
		if (!picked) return;
		if (picked.kind === 'outfit') {
			mark('look');
			setLook(l => ({ ...l, type: picked.id }));
		} else if (picked.kind === 'corpse') {
			mark('corpse');
			setCorpse(picked.id);
		} else {
			// An effect is written by name, not by id — `CONST_ME_FIREAREA` under
			// Ironcore, `firearea` under TFS — so a cell the catalogue cannot name
			// is one this engine has no way to ask for. Saying so beats writing an
			// id the loader would drop without a word.
			const area = picked.kind === 'effect';
			const table = area
				? mergeEffects(engineInfo(engine.key).magicEffects, custom.magic)
				: mergeEffects(engineInfo(engine.key).shootEffects, custom.shoot);
			const found = table.find(e => e.id === picked.id);
			if (!found) {
				showToast('error', t('Nothing in this engine’s catalogue names client effect {{id}}.', { id: picked.id }));
			} else {
				setAbilities(prev =>
					prev.map((b, j) =>
						j === openIndex
							? {
									...b,
									effects: area ? { ...b.effects, areaEffect: found.name } : { ...b.effects, shootEffect: found.name }
								}
							: b
					)
				);
			}
		}
		onPickUsed();
	}, [picked, mark, onPickUsed, engine.key, custom, openIndex, showToast, t]);

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
				attacks: [...(meleeOn && melee ? [melee.block] : []), ...abilities],
				loot: loot.filter(l => l.on).map(l => l.item.entry)
			};
		},
		[donors, name, race, raceid, engine, stats, look, corpse, kind, melee, meleeOn, abilities, loot]
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
		// Hidden rather than unmounted while a browser answers a question: the
		// wizard's state *is* the monster, and losing it to fetch one id would make
		// the trip cost more than it saves.
		<div className={hidden ? 'ss-backdrop mx-wiz-away' : 'ss-backdrop'} onMouseDown={onClose}>
			{/* The designer needs two columns and the visualiser needs room, so the
			    fight step is the one that widens. Everything else reads better narrow. */}
			<div
				className={step === 4 ? 'ss-modal mx-wiz mx-wiz-wide' : 'ss-modal mx-wiz'}
				onMouseDown={e => e.stopPropagation()}
				onKeyDown={onKeyDown}
			>
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
											<span className="mx-wiz-pick-name">{corpseInfo?.name ?? ''}</span>
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
								{/* Both answers are pictures, and the app already has the two
								    places those pictures live. Sending the user there beats a
								    second grid in here that is worse than the real one: no
								    animation, no filters, no name search, and a separate thing to
								    keep working. The wizard steps aside and takes the answer back. */}
								<div className="mx-wiz-browse">
									<button className="ss-btn" onClick={() => onBrowse('outfit')}>
										{t('Pick an outfit…')}
									</button>
									<button className="ss-btn" onClick={() => onBrowse('corpse')}>
										{t('Pick a corpse…')}
									</button>
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
								<div className={melee ? 'mx-wiz-melee' : 'mx-wiz-melee mx-wiz-item-off'}>
									<label className="mx-wiz-card-tick">
										<input
											type="checkbox"
											checked={meleeOn && melee !== null}
											disabled={melee === null}
											onChange={() => {
												mark('melee');
												setMeleeOn(v => !v);
											}}
										/>
										{t('Fights in melee')}
									</label>
									{melee && meleeOn && (
										<>
											<span className="mx-wiz-mini">{t('Skill')}</span>
											<input
												className="mx-wiz-input mono mx-wiz-num"
												type="number"
												min={0}
												value={melee.block.melee?.skill ?? 0}
												onChange={e => {
													mark('melee');
													setMelee(setMeleeField(melee, 'skill', Number(e.target.value)));
												}}
											/>
											<span className="mx-wiz-mini">{t('Attack')}</span>
											<input
												className="mx-wiz-input mono mx-wiz-num"
												type="number"
												min={0}
												value={melee.block.melee?.attack ?? 0}
												onChange={e => {
													mark('melee');
													setMelee(setMeleeField(melee, 'attack', Number(e.target.value)));
												}}
											/>
											<span className="mx-wiz-mini">
												{t('max {{damage}}', { damage: meleeBlockMax(melee.block) ?? '—' })}
											</span>
										</>
									)}
									{melee && !meleeOn && <span className="mx-wiz-item-from">{t('from {{name}}', { name: melee.from })}</span>}
								</div>
								{melee === null && (
									<div className="ss-modal-desc">{t('No donor in this band fights in melee, so there is no block to copy.')}</div>
								)}

								{/* The ability designer. One ability on screen, the rail above it
								    the whole kit — and the card is the editor's own SpellCard, so
								    the fields offered are the ones the chosen spell family actually
								    reads, spelled the way this engine spells them, with the same
								    live re-enactment behind its eye. A second, wizard-shaped copy
								    of that would be a second thing to keep true across seven
								    engines and would be wrong first. */}
								<div className="mx-wiz-sub">{t('Abilities')}</div>
								{abilities.length === 0 ? (
									<div className="ss-modal-desc">
										{t('No abilities yet. Design one, or leave it — a monster with only melee is a monster.')}
									</div>
								) : (
									<>
										<div className="mx-wiz-rail">
											{abilities.map((b, i) => (
												<button
													key={i}
													className={i === openIndex ? 'mx-wiz-chip mx-wiz-chip-on' : 'mx-wiz-chip'}
													onClick={() => setActive(i)}
												>
													{b.name ?? b.script ?? t('script')}
												</button>
											))}
										</div>
										{open && (
											<div className="mx-wiz-designer">
												<SpellCard
													block={open}
													file={file || 'new'}
													onChange={next => setAbilities(abilities.map((b, j) => (j === openIndex ? next : b)))}
													spells={spellNames}
													engine={engine.key}
													lintAt={suffix => lints.filter(l => l.path === `attacks[${openIndex + abilityOffset}].${suffix}`)}
													readOnly={false}
													parent="attacks"
													look={{ ...blankLook, ...look, mode: 'type' }}
													onBrowseEffect={kind => onBrowse(kind === 'area' ? 'effect' : 'missile')}
													defaultStaged
												/>
											</div>
										)}
									</>
								)}
								<div className="mx-wiz-rowend">
									{open && (
										<button
											className="ss-btn ss-btn-ghost ss-ed-mini"
											onClick={() => {
												setAbilities(abilities.filter((_, j) => j !== openIndex));
												setActive(a => Math.max(0, a - 1));
											}}
										>
											{t('Remove this ability')}
										</button>
									)}
									<button className="ss-btn" onClick={addAbility}>
										<Plus size={14} />
										{t('Add an ability')}
									</button>
								</div>
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
