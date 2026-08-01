// The create wizard: seven questions, each arriving with an answer already in it.
//
// They are asked in the order a monster is imagined rather than the order the
// file is written: what kind of thing it is, what it is like, what it looks
// like, what it is called, and only then the numbers. Naming comes fourth
// because a name is easier to accept once there is something on screen to name.
//
// The second question is the one that makes the rest worth answering. "Similar
// to a bandit, a wild warrior and a hunter" narrows the corpus to a family, and
// every proposal after it — the immunities, the melee block, the loot table,
// the band the stats are read off — is lifted off those monsters rather than
// off whatever the kind's whole pool happened to hold.
//
// The generator supplies the default answer to every question and the user
// supplies the ones they care about. Accept them all and you get what a
// dice-roll would have given you, except you watched it being made and know
// what is in it; override three and the other three fill themselves in around
// your choices.
//
// Nothing is written until the last click. The wizard's state is a MonsterDoc
// in memory and nothing else, so Escape on the last step leaves no scratch file, no
// registry entry and nothing to clean up.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dices, ChevronLeft, Plus, Trash2, X } from 'lucide-react';
import {
	balanceBands,
	createMonster,
	droppedItemIds,
	getMonster,
	itemUrl,
	lintMonster,
	lookUrl,
	monstersRowUrl,
	monsterTemplate,
	nextFreeRaceid,
	saveMonster,
	MIN_BAND_N,
	type BalanceBand,
	type ItemIndex,
	type ItemInfo,
	type Lint,
	type LootEntry,
	type MonsterDoc,
	type MonsterSummary,
	type SpellBlock,
	type SpellName
} from './monster';
import { engineInfo, type EngineInfo } from './engine';
import { CompactProvider } from './fields/Field';
import { useItemInfo } from './fields/ItemPicker';
import { useCustomEffects } from './fields/customctx';
import { mergeEffects } from './customeffects';
import { NumberField } from './fields/NumberField';
import { SpellCard } from './sections/SpellCard';
import { blankSpell } from './sections/Spells';
import { MAX_CHANCE, MAX_COUNTMAX, newLootEntry, oddsText } from './sections/Loot';
import { meleeBlockMax } from './derive';
import { makeRng } from './lootsim';
import { generateName, type NameStyle } from './namegen';
import {
	KINDS,
	bandFor,
	defaultBand,
	flagsFor,
	matchesKind,
	median,
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
	/** What was clicked over there, on its way back — one cell for every question
	 *  but loot, which comes back as the whole tray. */
	picked: { kind: PickKind; ids: number[] } | null;
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
export type PickKind = 'outfit' | 'corpse' | 'effect' | 'missile' | 'loot';

/** A ticked proposal — the shape both the spell and loot lists use. */
interface Ticked<T> {
	item: T;
	on: boolean;
}

/** The questions, in the order a monster is imagined. Named rather than counted
 *  because they are referred to from eight places — the width of the dialog, the
 *  focus, what Enter does, which button is primary — and a step inserted in the
 *  middle used to mean finding every one of them. */
const KIND_STEP = 0;
const SIMILAR_STEP = 1;
const LOOK_STEP = 2;
const NAME_STEP = 3;
const STATS_STEP = 4;
const FIGHT_STEP = 5;
const DROP_STEP = 6;
const STEP_COUNT = 7;

/** As many neighbours as are worth naming. Past this the picks stop describing
 *  one family and start describing the corpus, which is what the drawn default
 *  already does. */
const MAX_SIMILAR = 10;

/** The ceiling on a draw. Not a limit on how much a monster may drop — the
 *  browser adds as many as you like on top — but on how many the generator will
 *  propose, and a proposal longer than this is one nobody reads. */
const MAX_DRAW = 25;

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
	/** The neighbours the user named. Empty means "draw your own", which is what
	 *  every run did before the question existed. */
	const [similar, setSimilar] = useState<MonsterSummary[]>([]);
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
	/** How many drops a draw proposes. Five is what a mid-band monster in this
	 *  corpus tends to have; a boss wants more and a bat wants one, and the
	 *  generator has no way to know which without being told. */
	const [drawCount, setDrawCount] = useState(5);

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

	// ---- Donors are the named neighbours, or a draw when there are none ----
	useEffect(() => {
		if (monsters.length === 0) return;
		let live = true;
		const chosen = similar.length > 0 ? similar : pickDonors(makeRng(seed ^ 0x5f3a), monsters, band, kind, 3);
		void Promise.all(chosen.map(m => getMonster(m.file).catch(() => null)))
			.then(docs => live && setDonors(docs.filter((d): d is MonsterDoc => d !== null)))
			.catch(() => undefined);
		return () => {
			live = false;
		};
	}, [monsters, band, kind, seed, similar]);

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
		const drawn = sampleLoot(makeRng((seed ^ 0xbee5) + nonce.loot), donors, dropped, items, drawCount);
		setLoot(drawn.map(item => ({ item, on: true })));
	}, [donors, dropped, items, seed, nonce.loot, kind, hasItems, touched, drawCount]);

	/** Naming a neighbour is also a statement about power, so the band follows the
	 *  middle of the picks — set here rather than in an effect so that moving the
	 *  slider afterwards stays moved. The kind buttons make the same bargain. */
	const toggleSimilar = useCallback(
		(m: MonsterSummary) => {
			setSimilar(prev => {
				const on = prev.some(x => x.file === m.file);
				if (!on && prev.length >= MAX_SIMILAR) return prev;
				const next = on ? prev.filter(x => x.file !== m.file) : [...prev, m];
				setBandLabel(
					next.length > 0
						? bandFor(bands, median(next.map(x => x.experience)))?.label ?? null
						: defaultBand(bands, kind)?.label ?? null
				);
				return next;
			});
		},
		[bands, kind]
	);

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
			setLook(l => ({ ...l, type: picked.ids[0] ?? 0 }));
		} else if (picked.kind === 'corpse') {
			mark('corpse');
			setCorpse(picked.ids[0] ?? 0);
		} else if (picked.kind === 'loot') {
			// The tray comes back whole and is added to what is already listed, so
			// two trips collect rather than replace. An id already in the table is
			// skipped rather than doubled — the tray does not clear itself, and a
			// second visit to add one more item must not duplicate the first five.
			//
			// The names are looked up rather than carried back, because the entry
			// wants them anyway: an item added by id says nothing to anyone reading
			// the file, so the name rides along as the trailing comment, exactly as
			// the editor's own tray writes it.
			mark('loot');
			const ids = picked.ids;
			void Promise.all(ids.map(id => itemIndex.get(id).catch(() => null))).then(infos =>
				setLoot(prev => {
					const have = new Set(prev.map(l => l.item.entry.id));
					const fresh = ids
						.map((id, i) => ({ id, name: infos[i]?.name }))
						.filter(x => !have.has(x.id));
					return [
						...prev,
						...fresh.map(x => ({ item: { entry: newLootEntry({ serverId: x.id, name: x.name }), from: '' }, on: true }))
					];
				})
			);
		} else {
			// An effect is written by name, not by id — `CONST_ME_FIREAREA` under
			// Ironcore, `firearea` under TFS — so a cell the catalogue cannot name
			// is one this engine has no way to ask for. Saying so beats writing an
			// id the loader would drop without a word.
			const area = picked.kind === 'effect';
			const table = area
				? mergeEffects(engineInfo(engine.key).magicEffects, custom.magic)
				: mergeEffects(engineInfo(engine.key).shootEffects, custom.shoot);
			const id = picked.ids[0] ?? 0;
			const found = table.find(e => e.id === id);
			if (!found) {
				showToast('error', t('Nothing in this engine’s catalogue names client effect {{id}}.', { id }));
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
	}, [picked, mark, onPickUsed, engine.key, custom, openIndex, itemIndex, showToast, t]);

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
	const canAdvance = step !== NAME_STEP || name.trim().length > 0;

	// The loot step is always reached, even when it has nothing to offer — it says
	// why instead of listing ids it cannot vouch for. Skipping it outright would
	// strand the user on the step before, where the primary button is still "Next".
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
			{/* Width follows the question, and only while the question needs it: the
			    fight step is a designer around a visualiser, but not until there is
			    an ability to design, and the drop step is a table whose names need
			    somewhere to be, but not when it has nothing to list. Everything else
			    is one thing to answer and reads better narrow. */}
			<div
				className={`ss-modal mx-wiz${
					step === FIGHT_STEP && abilities.length > 0
						? ' mx-wiz-wide'
						: step === SIMILAR_STEP || (step === DROP_STEP && lootStep)
							? ' mx-wiz-mid'
							: ''
				}`}
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
						{step === KIND_STEP && (
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

						{step === SIMILAR_STEP && (
							// The kind narrowed the corpus to a pool; this narrows it to a
							// family. Everything the wizard proposes from here on — the
							// immunities, the melee block, the loot table, the band the stats
							// are read off — is lifted off the monsters named here, so naming
							// six humanoids is the difference between a monster that belongs
							// in that camp and one drawn from the whole server.
							//
							// Answering nothing is a real answer: the pool the kind chose is
							// what the wizard drew from before this question existed, and it
							// still is.
							<Step question={t('Is it similar to anything else?')}>
								<MonsterPicker
									monsters={monsters}
									kind={kind}
									band={band}
									picked={similar}
									onToggle={toggleSimilar}
								/>
								<div className="ss-modal-desc">
									{similar.length === 0
										? t('Optional. Name a few and the immunities, the melee, the drops and the power level all come off them; name none and the wizard draws from every {{kind}} in the corpus.', {
												kind: t(KINDS.find(k => k.key === kind)?.label ?? 'monster').toLowerCase()
											})
										: t('Everything from here is drawn from these {{count}}.', { count: similar.length })}
								</div>
							</Step>
						)}

						{step === LOOK_STEP && (
							<Step question={t('What does it look like?')}>
								{/* Two answers, two cards, each the size of the thing it is
								    about: a step whose whole subject is what the monster looks
								    like should not be answered off a 64 px thumbnail. Both
								    answers are pictures, and the app already has the two places
								    those pictures live — sending the user there beats a second
								    grid in here that is worse than the real one (no animation,
								    no filters, no name search, and a separate thing to keep
								    working). Each card's button is that hand-off; the wizard
								    steps aside and takes the answer back. */}
								<div className="mx-wiz-look">
									<div className="mx-wiz-look-card">
										<div className="mx-wiz-look-title">
											{t('Outfit')}
											<button
												className="ss-btn ss-btn-ghost ss-ed-mini"
												title={t('Draw another')}
												onClick={() => redraw('look')}
											>
												<Dices size={13} />
											</button>
										</div>
										<div className="mx-wiz-look-stage">
											<img
												className="mx-wiz-look-sprite"
												src={lookUrl({ ...blankLook, ...look, mode: 'type' }, { cell: 128 })}
												alt=""
											/>
										</div>
										<div className="mx-wiz-look-foot">
											<input
												className="mx-wiz-input mono mx-wiz-look-id"
												type="number"
												title={t('Outfit')}
												value={look.type}
												onChange={e => {
													mark('look');
													setLook({ ...look, type: Number(e.target.value) });
												}}
											/>
											<button className="ss-btn" onClick={() => onBrowse('outfit')}>
												{t('Pick an outfit…')}
											</button>
										</div>
									</div>

									<div className="mx-wiz-look-card">
										<div className="mx-wiz-look-title">{t('Corpse')}</div>
										<div className="mx-wiz-look-stage">
											<img
												className="mx-wiz-look-sprite"
												src={itemUrl(corpse, 128)}
												alt=""
												// No corpse, or one the database cannot draw: an empty
												// tile rather than the browser's broken-image glyph.
												onError={e => (e.currentTarget.style.visibility = 'hidden')}
												onLoad={e => (e.currentTarget.style.visibility = 'visible')}
											/>
										</div>
										<div className="mx-wiz-look-foot">
											<input
												className="mx-wiz-input mono mx-wiz-look-id"
												type="number"
												title={t('Corpse')}
												value={corpse}
												onChange={e => {
													mark('corpse');
													setCorpse(Number(e.target.value));
												}}
											/>
											<button className="ss-btn" onClick={() => onBrowse('corpse')}>
												{t('Pick a corpse…')}
											</button>
										</div>
										<div className="mx-wiz-pick-name">{corpseInfo?.name ?? ''}</div>
									</div>
								</div>

								{/* Race is not a picture, so it does not get a card — it is the
								    one field on this step that is typed rather than looked at. */}
								<label className="mx-wiz-field mx-wiz-look-race">
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

								<div className="ss-modal-desc">
									{outfitIds.length === 0
										? t('No client is open, so there is nothing to draw — the outfit is an id, and the server will resolve it.')
										: t('The outfit is one no monster in this corpus wears. The corpse is a donor’s, so the item database can resolve it.')}
								</div>
							</Step>
						)}

						{step === NAME_STEP && (
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

						{step === STATS_STEP && (
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

						{step === FIGHT_STEP && (
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
											<span
												className="mx-wiz-mini"
												title={t('Derived: ceil(skill × attack × 0.05 + attack × 0.5). The loader computes it, so there is no field for it.')}
											>
												{t('max {{damage}}', { damage: meleeBlockMax(melee.block) ?? '—' })}
											</span>
										</>
									)}
									{melee && !meleeOn && <span className="mx-wiz-item-from">{t('from {{name}}', { name: melee.from })}</span>}
								</div>
								{melee === null && (
									<span
										className="mx-wiz-mini"
										title={t('A melee block is copied off a donor rather than composed, and nothing in this band has one to lend.')}
									>
										{t('no melee available')}
									</span>
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
									<div className="ss-modal-desc" title={t('A monster with only melee is a monster — this step is happy with none.')}>
										{t('No abilities yet.')}
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
												{/* Every explanation the card carries folds onto a ⓘ in
												    compact mode. The words are all still there; the wall
												    of them between the user and six numbers is not. */}
												<CompactProvider>
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
												</CompactProvider>
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

						{step === DROP_STEP && lootStep && (
							// Which items drop is a question for the items browser — the real
							// one, with its filters, its search and its Loot tray — so this
							// step asks the other half: how often, and how many. The rows are
							// a proposal off the donors to begin with; the tray adds to them.
							<Step question={t('What does it drop, and how often?')}>
								<div className="mx-wiz-loot">
									<div className="mx-wiz-loot-head">
										<span className="mx-wiz-loot-cell-name">{t('Item')}</span>
										<span className="mx-wiz-loot-cell-chance">{t('Chance')}</span>
										<span className="mx-wiz-loot-cell-count">{t('Count')}</span>
										<span className="mx-wiz-loot-cell-from" />
									</div>
									<div className="mx-wiz-loot-rows">
										{loot.length === 0 && (
											<div className="ss-modal-desc mx-wiz-loot-empty">
												{t('Nothing drops yet. Pick the items in the browser, then set the odds here.')}
											</div>
										)}
										{loot.map((l, i) => (
											<LootRow
												key={`${l.item.entry.id}-${i}`}
												row={l}
												name={items.get(l.item.entry.id ?? -1)?.name ?? l.item.entry.comment ?? `#${l.item.entry.id}`}
												onChange={next => {
													mark('loot');
													setLoot(loot.map((x, j) => (j === i ? next : x)));
												}}
												onRemove={() => {
													mark('loot');
													setLoot(loot.filter((_, j) => j !== i));
												}}
											/>
										))}
									</div>
								</div>
								<div className="mx-wiz-loot-actions">
									<button className="ss-btn" onClick={() => onBrowse('loot')}>
										<Plus size={14} />
										{t('Pick items…')}
									</button>
									{/* How many to draw, then the draw: the parameter reads before
									    the button that uses it. A boss wants twelve drops and a bat
									    wants one, and five is only ever a guess at which this is —
									    the one thing the corpus cannot tell the generator. */}
									<span className="mx-wiz-loot-draw">
										<NumberField
											value={drawCount}
											onChange={setDrawCount}
											min={1}
											max={MAX_DRAW}
											hardMax={MAX_DRAW}
											width={56}
											title={t('How many items a draw proposes')}
										/>
										<span className="mx-wiz-mini">{t('items')}</span>
									</span>
									<button
										className="ss-btn ss-btn-ghost ss-ed-mini"
										title={t('Replaces the table with a fresh draw off the donors')}
										onClick={() => redraw('loot')}
									>
										{t('Draw again')}
									</button>
									<span className="mx-wiz-mini mx-wiz-loot-total">
										{t('{{count}} drop', { count: loot.filter(l => l.on).length })}
									</span>
								</div>
							</Step>
						)}

						{step === DROP_STEP && !lootStep && (
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
									{similar.length > 0 ? t('similar to') : t('donors')}: {donors.map(d => d.name).join(', ')}
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

/** Cell size in the neighbour grid, and how many share one atlas request. The
 *  grid asks `/monsters.png` for a strip per block rather than a PNG per cell,
 *  the same bargain the sidebar list makes — a corpus is hundreds of monsters
 *  and this one is browsed, not scrolled past. */
const MON_SPRITE = 48;
const MON_CHUNK = 30;

/**
 * The neighbour picker: every monster in the corpus as its own sprite, the ones
 * this kind would have drawn from first.
 *
 * A picture per row rather than per cell — `/monsters.png` returns a strip and
 * each cell shows its slice of it, so browsing four hundred monsters is a
 * handful of requests. The ordering is the answer to "which of these are even
 * plausible": the kind's own pool, then the band's, then everything else, each
 * alphabetical, so the grid opens on the monsters the sentence "similar to" is
 * likely to end with and the search is for when it does not.
 */
function MonsterPicker({
	monsters,
	kind,
	band,
	picked,
	onToggle
}: {
	monsters: MonsterSummary[];
	kind: Kind;
	band: BalanceBand | null;
	picked: MonsterSummary[];
	onToggle: (m: MonsterSummary) => void;
}) {
	const { t } = useTranslation();
	const [query, setQuery] = useState('');
	// The band as the step opened, not as it stands. Naming a neighbour moves the
	// band to the middle of the picks, and ranking on the live one would reshuffle
	// the grid under the cursor on every click — the cell you were about to press
	// second is somewhere else by the time you press it.
	const [rankBand] = useState(band);

	const chosen = useMemo(() => new Set(picked.map(m => m.file)), [picked]);

	const shown = useMemo(() => {
		const q = query.trim().toLowerCase();
		const matched = q ? monsters.filter(m => m.name.toLowerCase().includes(q)) : monsters;
		// Rank rather than filter: a corpus with three bosses in it must still
		// offer the other four hundred monsters, just not first.
		const rank = (m: MonsterSummary) => {
			const inBand = rankBand ? m.experience >= rankBand.min && m.experience <= rankBand.max : true;
			if (matchesKind(m, kind) && inBand) return 0;
			if (inBand) return 1;
			return matchesKind(m, kind) ? 2 : 3;
		};
		return [...matched].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
	}, [monsters, query, kind, rankBand]);

	// One atlas per aligned block of the list, addressed by each cell's offset
	// into it. Blocks rather than the visible window: a corpus is a dozen
	// requests this way, and a scroll listener to save half of them is a scroll
	// listener to keep working. The whole corpus is drawn — a cap here would be
	// a monster the user cannot pick and cannot see is missing.
	const chunks = useMemo(() => {
		const out: { start: number; files: string[]; url: string }[] = [];
		for (let start = 0; start < shown.length; start += MON_CHUNK) {
			const files = shown.slice(start, start + MON_CHUNK).map(m => m.file);
			out.push({ start, files, url: monstersRowUrl(files, MON_SPRITE) });
		}
		return out;
	}, [shown]);

	const full = picked.length >= MAX_SIMILAR;

	return (
		<div className="mx-wiz-similar">
			<div className="mx-wiz-similar-bar">
				<input
					className="mx-wiz-input"
					value={query}
					onChange={e => setQuery(e.target.value)}
					placeholder={t('Search the corpus…')}
				/>
				<span className={full ? 'mx-wiz-mini mx-wiz-similar-full' : 'mx-wiz-mini'}>
					{t('{{n}} of {{max}}', { n: picked.length, max: MAX_SIMILAR })}
				</span>
			</div>

			{/* What has been named, always in sight — the grid reorders under a
			    search and a pick that scrolled away is one nobody can take back. */}
			{picked.length > 0 && (
				<div className="mx-wiz-similar-picked">
					{picked.map(m => (
						<button key={m.file} className="mx-wiz-similar-chip" onClick={() => onToggle(m)} title={t('Remove')}>
							<img src={lookUrl(m.look, { cell: 24 })} alt="" />
							{m.name}
							<X size={12} />
						</button>
					))}
				</div>
			)}

			<div className="mx-wiz-similar-grid">
				{shown.length === 0 && <div className="ss-modal-desc">{t('Nothing in this corpus matches.')}</div>}
				{chunks.map(chunk =>
					chunk.files.map((_, i) => {
						const m = shown[chunk.start + i];
						const on = chosen.has(m.file);
						return (
							<button
								key={m.file}
								className={on ? 'mx-wiz-mon mx-wiz-mon-on' : 'mx-wiz-mon'}
								// Full is not the same as disabled: the picked ones must stay
								// clickable, because clicking one is how you make room.
								disabled={full && !on}
								title={t('{{name}} — {{exp}} exp', { name: m.name, exp: fmt(m.experience) })}
								onClick={() => onToggle(m)}
							>
								<span
									className="mx-wiz-mon-sprite"
									style={{
										backgroundImage: `url("${chunk.url}")`,
										backgroundSize: `${chunk.files.length * MON_SPRITE}px ${MON_SPRITE}px`,
										backgroundPosition: `-${i * MON_SPRITE}px 0`
									}}
								/>
								<span className="mx-wiz-mon-name">{m.name}</span>
							</button>
						);
					})
				)}
			</div>
		</div>
	);
}

/**
 * One drop: the item, how often, how many.
 *
 * The chance is typed as a percent and stored out of 100 000, and the odds
 * beside it read the draft rather than the committed value — the same bargain
 * the editor's own loot row makes, because "1 in 250" is what a chance means
 * and it should follow the keystrokes rather than lag a field behind them.
 *
 * The tick stays: a proposal argued against is one the user is still choosing
 * about, and a row that vanishes cannot be chosen back.
 */
function LootRow({
	row,
	name,
	onChange,
	onRemove
}: {
	row: Ticked<SampledLoot>;
	name: string;
	onChange: (next: Ticked<SampledLoot>) => void;
	onRemove: () => void;
}) {
	const { t } = useTranslation();
	const [draft, setDraft] = useState<number | null>(null);
	const entry = row.item.entry;
	const shown = draft ?? entry.chance;
	const setEntry = (p: Partial<LootEntry>) => onChange({ ...row, item: { ...row.item, entry: { ...entry, ...p } } });

	return (
		<div className={row.on ? 'mx-wiz-loot-row' : 'mx-wiz-loot-row mx-wiz-item-off'}>
			<label className="mx-wiz-loot-cell-name" title={name}>
				<input type="checkbox" checked={row.on} onChange={() => onChange({ ...row, on: !row.on })} />
				{entry.id !== null && <img className="mx-wiz-item-icon" src={itemUrl(entry.id, 32)} alt="" />}
				<span className="mx-wiz-item-name">{name}</span>
			</label>
			<span className="mx-wiz-loot-cell-chance" title={`chance="${shown}" of ${MAX_CHANCE}`}>
				<NumberField
					value={Number((entry.chance / 1000).toFixed(3))}
					onChange={v => setEntry({ chance: Math.max(0, Math.min(MAX_CHANCE, Math.round(v * 1000))) })}
					onDraft={raw => setDraft(raw === null || raw.trim() === '' || !Number.isFinite(Number(raw)) ? null : Math.max(0, Math.min(MAX_CHANCE, Math.round(Number(raw) * 1000))))}
					min={0}
					max={100}
					step={0.1}
					width={72}
				/>
				<span className="mx-wiz-loot-odds">{oddsText(shown)}</span>
			</span>
			<span className="mx-wiz-loot-cell-count">
				×
				<NumberField
					value={entry.countmax}
					onChange={v => setEntry({ countmax: v })}
					min={1}
					max={MAX_COUNTMAX}
					hardMax={MAX_COUNTMAX}
					width={56}
					title={t('Hard maximum 100 — a larger value makes the server drop the whole entry')}
				/>
			</span>
			<span className="mx-wiz-loot-cell-from">
				{row.item.from && <span className="mx-wiz-item-from">{t('from {{name}}', { name: row.item.from })}</span>}
				<button className="ss-btn ss-btn-ghost ss-ed-mini" title={t('Remove')} onClick={onRemove}>
					<Trash2 size={13} />
				</button>
			</span>
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
