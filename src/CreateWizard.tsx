// The create wizard: nine questions, each arriving with an answer already in it.
//
// They are asked in the order a monster is imagined rather than the order the
// file is written: what kind of thing it is, what it is like, what it looks
// like, what it is called, and only then the numbers. Naming comes fourth
// because a name is easier to accept once there is something on screen to name.
//
// The second question is the one that makes the rest worth answering, and it
// asks for two things. The *set* — "similar to a bandit, a wild warrior and a
// hunter" — narrows the corpus to a family, and everything that averages is
// read off it: the band, the resistances, the melee numbers, the loot pool. The
// *lead* — "most like the bandit" — is one monster, and everything that is a
// single decision comes off it whole: the outfit, the corpse, the race.
//
// Splitting them is not tidiness. Mixing donors for the outfit and the corpse
// produces a (looktype, corpse) pair that occurs nowhere in the corpus 94-99%
// of the time on every engine, and a shared looktype implies a single corpse in
// 81-100% of the corpus's own clusters — so a body drawn from one monster over
// a corpse drawn from another reads as a bug rather than as a draw, on the one
// step where the user is looking at pictures. The lead also replaces what used
// to decide those fields, which was `donors[0]` — whichever monster the user
// happened to click first.
//
// What the set decides, it decides by the lower median across the picks, never
// by a fixed threshold: see `inferResistances`.
//
// The generator supplies the default answer to every question and the user
// supplies the ones they care about. Accept them all and you get what a
// dice-roll would have given you, except you watched it being made and know
// what is in it; override three and the other six fill themselves in around
// your choices.
//
// A field the user has edited is never redrawn under them — and never silently
// kept, either, once the monsters it was derived from have changed. That case
// is `stale`, and it is the one the wizard asks about rather than deciding.
//
// Nothing is written until the last click. The wizard's state is a MonsterDoc
// in memory and nothing else, so Escape on the last step leaves no scratch file,
// no registry entry and nothing to clean up.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dices, ChevronLeft, Crown, Plus, Trash2, X } from 'lucide-react';
import {
	balanceBands,
	corpseDecays,
	createMonster,
	droppedItemIds,
	getMonster,
	itemUrl,
	lintMonster,
	lookUrl,
	monstersRowUrl,
	monsterTemplate,
	nextFreeRaceid,
	resolveLootIds,
	saveMonster,
	MIN_BAND_N,
	type AttacksStats,
	type BalanceBand,
	type ItemIndex,
	type ItemInfo,
	type Lint,
	type LootEntry,
	type MonsterDoc,
	type MonsterSummary,
	type SpellBlock,
	type SpellName,
} from './monster';
import { engineInfo, type EngineInfo } from './engine';
import { damageTypes } from './catalog';
import { CompactProvider } from './fields/Field';
import { useItemInfo } from './fields/ItemPicker';
import { useCustomEffects } from './fields/customctx';
import { EffectBrowse } from './fields/EffectSelect';
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
	applyResistances,
	bandFor,
	blankSummon,
	defaultBand,
	donorSignature,
	drawCountFor,
	flagsFor,
	inferResistances,
	matchesKind,
	maxSummonsFor,
	median,
	newSeed,
	pickAttacksStats,
	pickMelee,
	sampleLoot,
	sampleLook,
	sampleStats,
	sampleVoices,
	usableBands,
	voiceCadence,
	type Kind,
	type OutfitInfo,
	type Resistance,
	type SampledLook,
	type SampledLoot,
	type SampledSpell,
	type SampledSummon,
	type SampledVoice,
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
	/** The client's outfits with their layer count, so a drawn look knows
	 *  whether its four colours will render or be inert. */
	outfits: OutfitInfo[];
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

/** A ticked proposal — the shape the spell, voice, summon and loot lists use. */
interface Ticked<T> {
	item: T;
	on: boolean;
}

/** The questions, in the order a monster is imagined. Named rather than counted
 *  because they are referred to from a dozen places — the width of the dialog,
 *  the focus, what Enter does, which button is primary — and a step inserted in
 *  the middle used to mean finding every one of them.
 *
 *  **One question per step, and a short step is not a fault.** The wizard exists
 *  to walk someone through a monster rather than hand them the editor's wall of
 *  fields, and three steps that each ask one thing beat one step that asks
 *  three. Attacking, summoning and surviving were bundled that way and read as
 *  a form; they are separate questions and are asked separately. */
const KIND_STEP = 0;
const SIMILAR_STEP = 1;
const LOOK_STEP = 2;
const NAME_STEP = 3;
const STATS_STEP = 4;
const ATTACK_STEP = 5;
const ABILITY_STEP = 6;
const SUMMON_STEP = 7;
const SUMMON_DETAIL_STEP = 8;
const RESIST_STEP = 9;
const DEFEND_STEP = 10;
const SAY_STEP = 11;
const DROP_STEP = 12;
const STEP_COUNT = 13;


/** As many neighbours as are worth naming. Past this the picks stop describing
 *  one family and start describing the corpus, which is what the drawn default
 *  already does. */
const MAX_SIMILAR = 10;

/** The ceiling on a draw. Not a limit on how much a monster may drop — the
 *  browser adds as many as you like on top — but on how many the generator will
 *  propose, and a proposal longer than this is one nobody reads. */
const MAX_DRAW = 25;

/** How far down the corpse preference order the draw will look. Every candidate
 *  is one resolve request, and the list is ordered donors-first, so this is a
 *  ceiling on the search rather than on the choice. */
const MAX_CORPSE_CANDIDATES = 60;

/** How many voice lines the proposal shows. Ranked, so this cuts the tail
 *  rather than the answer. */
const MAX_VOICES = 12;

/** Everything the generator can fill in, and therefore everything `touched` and
 *  `derivedFrom` have keys for. A field the user has edited is never redrawn
 *  under them; a field whose donors changed afterwards goes stale. */
type Field =
	| 'name'
	| 'stats'
	| 'armor'
	| 'look'
	| 'race'
	| 'corpse'
	| 'melee'
	| 'resist'
	| 'defenses'
	| 'voices'
	| 'summons'
	| 'loot';

export default function CreateWizard({
	hidden,
	onBrowse,
	picked,
	onPickUsed,
	monsters,
	groups,
	engine,
	outfits,
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
	const [nonce, setNonce] = useState<Record<Field, number>>({
		name: 0,
		stats: 0,
		armor: 0,
		look: 0,
		race: 0,
		corpse: 0,
		melee: 0,
		resist: 0,
		defenses: 0,
		voices: 0,
		summons: 0,
		loot: 0
	});

	// ---- Answers ----
	const [name, setName] = useState('');
	// One style. The corpus-derived generator was removed with its radio row.
	const nameStyle: NameStyle = 'classic';
	const [file, setFile] = useState('');
	const [group, setGroup] = useState(groups[0] ?? '');
	const [showFile, setShowFile] = useState(false);
	const [kind, setKind] = useState<Kind>('monster');
	/** The neighbours the user named. Empty means "draw your own", which is what
	 *  every run did before the question existed — and still does, because the
	 *  drawn donors are shown as picks rather than hidden. */
	const [similar, setSimilar] = useState<MonsterSummary[]>([]);
	/** Which of them the monster is *most* like. Null follows the first donor. */
	const [leadFile, setLeadFile] = useState<string | null>(null);
	const [bandLabel, setBandLabel] = useState<string | null>(null);
	const [stats, setStats] = useState<Stats | null>(null);
	const [look, setLook] = useState<SampledLook>({ type: 0, head: 0, body: 0, legs: 0, feet: 0, from: null, colourable: false });
	const [race, setRace] = useState<string | null>(null);
	const [corpse, setCorpse] = useState(0);
	const [melee, setMelee] = useState<SampledSpell | null>(null);
	const [meleeOn, setMeleeOn] = useState(true);
	/** Nostalrius keeps melee on `<attacks>` itself, so there is no spell block to
	 *  donate and the melee card has nothing to show. Without this the engine's
	 *  every wizard monster shipped at the template's attack 20 / skill 20. */
	const [attacksStats, setAttacksStats] = useState<AttacksStats | null>(null);
	/** The abilities the user designed, in two families. Nothing is drawn into
	 *  either: a monster's kit is the one part of it nobody wants handed to them,
	 *  and a sampled spell is one you have to read before you can trust it. */
	const [abilities, setAbilities] = useState<SpellBlock[]>([]);
	const [defenses, setDefenses] = useState<SpellBlock[]>([]);
	/** Which ability each designer has open. One at a time: the rail above it
	 *  carries the whole kit, and five open cards is a page, not a question. */
	const [active, setActive] = useState(0);
	const [activeDefense, setActiveDefense] = useState(0);
	const [resist, setResist] = useState<Resistance[]>([]);
	const [voicesOn, setVoicesOn] = useState(false);
	const [voices, setVoices] = useState<Ticked<SampledVoice>[]>([]);
	const [cadence, setCadence] = useState({ interval: 5000, chance: 10 });
	const [summons, setSummons] = useState<Ticked<SampledSummon>[]>([]);
	/** Which summon row sent the user to the effects browser, and which of its
	 *  two effect fields is waiting for the answer. The trip out and back loses
	 *  every other kind of context — the browser knows only that an effect was
	 *  asked for — so the question has to be held here until the answer lands. */
	const [summonFx, setSummonFx] = useState<{ index: number; field: 'effect' | 'masterEffect' } | null>(null);
	/** How many summons may be alive at once. Drawn off the donors like the rest
	 *  of the proposal, but typed over like the rest of it too — zero here is the
	 *  one value that makes every entry below inert, so it is worth a field rather
	 *  than a constant nobody can see. */
	const [maxSummons, setMaxSummons] = useState(2);
	const [loot, setLoot] = useState<Ticked<SampledLoot>[]>([]);
	/** The monsters the drops come off, which need not be the ones the monster is
	 *  like. Null follows the identity set, which is what almost every run wants;
	 *  "fights like a demon, drops like a dragon" is the one that does not. */
	const [lootSimilar, setLootSimilar] = useState<MonsterSummary[] | null>(null);
	const [showLootDonors, setShowLootDonors] = useState(false);
	/** How many drops a draw proposes. Seeded from the donors' own tables rather
	 *  than from a constant — the bands run from a couple of entries to twenty-odd,
	 *  and any one number is wrong at one end of the corpus. */
	const [drawCount, setDrawCount] = useState(5);

	// ---- Corpus ----
	const [bands, setBands] = useState<BalanceBand[]>([]);
	const [dropped, setDropped] = useState<number[]>([]);
	const [donors, setDonors] = useState<MonsterDoc[]>([]);
	const [lootDonors, setLootDonors] = useState<MonsterDoc[]>([]);
	const [lootIds, setLootIds] = useState<Map<string, (number | null)[]>>(new Map());
	const [items, setItems] = useState<Map<number, ItemInfo>>(new Map());
	const [template, setTemplate] = useState<MonsterDoc | null>(null);
	const [raceid, setRaceid] = useState<number | null>(null);
	const [lints, setLints] = useState<Lint[]>([]);

	const takenNames = useMemo(() => new Set(monsters.map(m => m.name.toLowerCase())), [monsters]);
	const corpusNames = useMemo(() => monsters.map(m => m.name), [monsters]);
	const band = useMemo(() => bands.find(b => b.label === bandLabel) ?? null, [bands, bandLabel]);

	/** The one monster the single-decision fields come off. Falls to the first
	 *  donor, which is what the old code used for everything — the difference is
	 *  that this one is nameable, visible and one click to change. */
	const lead = useMemo(() => donors.find(d => d.file === leadFile) ?? donors[0] ?? null, [donors, leadFile]);

	// Which monsters each derived answer was read off. Compared against the
	// current set to tell "the user edited this" from "the user edited this and
	// then changed the monsters it came from", which need opposite treatment.
	const sig = useMemo(() => donorSignature(donors), [donors]);
	const [derivedFrom, setDerivedFrom] = useState<Partial<Record<Field, string>>>({});
	const noteDerived = useCallback((f: Field, from: string) => {
		setDerivedFrom(prev => (prev[f] === from ? prev : { ...prev, [f]: from }));
	}, []);

	/** Touched, and derived from a set of monsters that is no longer the set. */
	const stale = useMemo(
		() => new Set([...touched].filter(f => derivedFrom[f] !== undefined && derivedFrom[f] !== sig)),
		[touched, derivedFrom, sig]
	);

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

	// ---- The named neighbours, or a draw shown as if they had been named ----
	//
	// The drawn set used to be invisible: an empty answer meant three monsters
	// nobody could see doing all the work. Promoting them to picks costs nothing
	// and makes the whole step honest — the list is never empty by accident, so
	// clearing it can legitimately mean "no family", and the lead is a real
	// choice rather than an artefact of click order.
	// Nothing is drawn here, deliberately.
	//
	// This step used to open with three monsters already picked, chosen at random
	// from the kind and band. It read as a suggestion and was not one: asked to
	// make a human, it would answer "similar to a scorpion, a dragon and a demon"
	// — three names with nothing to do with each other or with the question, and
	// the user's first job became undoing them.
	//
	// The step is a question the user may decline. Nothing is selected until they
	// select it, and an empty set is a complete answer: everything downstream
	// falls back to the whole kind pool, which is what the random three were
	// approximating anyway.

	useEffect(() => {
		if (similar.length === 0) {
			setDonors([]);
			return;
		}
		let live = true;
		void Promise.all(similar.map(m => getMonster(m.file).catch(() => null)))
			.then(docs => live && setDonors(docs.filter((d): d is MonsterDoc => d !== null)))
			.catch(() => undefined);
		return () => {
			live = false;
		};
	}, [similar]);

	// The lead must stay one of the picks. Dropping the monster that was lead
	// falls back to the first rather than leaving a dangling name.
	useEffect(() => {
		if (leadFile && !similar.some(m => m.file === leadFile)) setLeadFile(null);
	}, [similar, leadFile]);

	// ---- Loot donors: the identity set unless the user said otherwise ----
	const lootPicks = lootSimilar ?? similar;
	useEffect(() => {
		if (lootPicks.length === 0) {
			setLootDonors([]);
			return;
		}
		let live = true;
		void Promise.all(lootPicks.map(m => getMonster(m.file).catch(() => null)))
			.then(docs => live && setLootDonors(docs.filter((d): d is MonsterDoc => d !== null)))
			.catch(() => undefined);
		return () => {
			live = false;
		};
	}, [lootPicks]);

	// Loot written by name is loot the draw could not see: 46% of Ironcore's
	// entries and 62% of Canary's carry a name and no id, and `sampleLoot` skips
	// what it cannot address. The item index lives on the backend, so the
	// resolution does too.
	useEffect(() => {
		if (lootDonors.length === 0) return;
		let live = true;
		void Promise.all(
			lootDonors.map(d =>
				resolveLootIds(d.file)
					.then(ids => [d.file, ids] as [string, (number | null)[]])
					.catch(() => [d.file, []] as [string, (number | null)[]])
			)
		).then(pairs => live && setLootIds(new Map(pairs)));
		return () => {
			live = false;
		};
	}, [lootDonors]);

	/** Corpse ids the drawn corpse may come from, best first: the lead's own, the
	 *  other donors', then the ones worn by monsters of this kind, then the rest
	 *  of the corpus.
	 *
	 *  Ordered rather than filtered, because the choice is made by walking this
	 *  list until one passes `corpseDecays` — so the lead's corpse still wins when
	 *  it rots, which is the common case and what keeps the body and the corpse
	 *  belonging to the same monster. Corpse ids come off the summaries, so the
	 *  whole corpus is available without loading a single document. */
	const corpseCandidates = useMemo(() => {
		const seen = new Set<number>();
		const out: number[] = [];
		const push = (id: number) => {
			if (id > 0 && !seen.has(id)) {
				seen.add(id);
				out.push(id);
			}
		};
		if (lead) push(lead.look.corpse);
		for (const donor of donors) push(donor.look.corpse);
		for (const m of monsters) if (matchesKind(m, kind)) push(m.look.corpse);
		for (const m of monsters) push(m.look.corpse);
		// Bounded because every candidate is one resolve request. They are in
		// preference order, so a decaying corpse further down the tail than this
		// is one the draw was never going to reach anyway.
		return out.slice(0, MAX_CORPSE_CANDIDATES);
	}, [lead, donors, monsters, kind]);

	// ---- Resolve the items the proposals will need ----
	useEffect(() => {
		const ids = new Set<number>();
		for (const donor of lootDonors) {
			for (const entry of donor.loot) if (entry.id !== null) ids.add(entry.id);
			for (const id of lootIds.get(donor.file) ?? []) if (id !== null) ids.add(id);
		}
		for (const id of corpseCandidates) ids.add(id);
		// A slice of the drop pool, for the top-up — resolving all of it would be
		// one request per id on a corpus that drops thousands. Sampled rather than
		// taken from the head: `dropped` is sorted by id, so the first 200 are the
		// lowest ids in the corpus, and a cap meant as a request budget had quietly
		// become a content filter.
		for (const id of spread(dropped, 200, seed ^ 0x9e37)) ids.add(id);
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
	}, [lootDonors, lootIds, dropped, itemIndex, corpseCandidates, seed]);

	// ---- Derive every untouched answer ----
	// The five figures are two answers on two steps — worth (experience, health,
	// speed) and armour — so each half keeps the half the user typed and lets the
	// band redraw the other. One key for both meant typing an armour value on the
	// defend step silently froze the worth step's slider.
	useEffect(() => {
		if (!band || (touched.has('stats') && touched.has('armor'))) return;
		setStats(prev => {
			const drawn = sampleStats(makeRng((seed ^ 0x1234) + nonce.stats), band);
			if (!prev) return drawn;
			return {
				...drawn,
				...(touched.has('stats')
					? { experience: prev.experience, health: prev.health, speed: prev.speed, percentile: prev.percentile }
					: null),
				...(touched.has('armor') ? { armor: prev.armor, defense: prev.defense } : null)
			};
		});
	}, [band, seed, nonce.stats, touched]);

	// The look comes off the lead, colours included — and the colours are only
	// drawn when the sprite has a layer to put them on.
	useEffect(() => {
		if (touched.has('look')) return;
		setLook(sampleLook(makeRng((seed ^ 0xa17f) + nonce.look), outfits, monsters, lead));
		noteDerived('look', sig);
	}, [outfits, monsters, lead, seed, nonce.look, touched, sig, noteDerived]);

	useEffect(() => {
		if (!lead) return;
		if (!touched.has('race')) {
			setRace(lead.race ?? engine.races[0] ?? null);
			noteDerived('race', sig);
		}
	}, [lead, engine.races, touched, sig, noteDerived]);

	useEffect(() => {
		if (donors.length === 0 || touched.has('corpse')) return;
		// Never invented: a corpse id has to exist in the item database and
		// actually be a corpse, and one already in use is known to be both.
		//
		// Which of them is drawn obeys `corpseDecays` — the same rule as the "Show
		// corpses with decay" filter the picker opens on, so the wizard proposes
		// the kind of corpse it would then show you. The fallback is the lead's
		// own, decaying or not: on Canary and CrystalServer nothing rots because
		// their item databases mark no corpses at all, and a corpse that outstays
		// its welcome still beats no corpse.
		const decaying = corpseCandidates.find(id => {
			const info = items.get(id);
			return info !== undefined && corpseDecays(info);
		});
		setCorpse(decaying ?? lead?.look.corpse ?? 0);
		noteDerived('corpse', sig);
	}, [donors, lead, corpseCandidates, items, touched, sig, noteDerived]);

	// Melee is its own answer, because it is the one attack a monster either has
	// or does not — the abilities are a handful it might. Taken off the nearest
	// donor rather than drawn, so the numbers in front of the user are numbers
	// this server already fights with, and the same band opens the same way
	// twice running.
	useEffect(() => {
		if (touched.has('melee') || donors.length === 0 || !stats) return;
		if (engine.meleeOnAttacks) {
			const found = pickAttacksStats(donors, stats.health);
			setAttacksStats(found?.stats ?? null);
			setMelee(null);
			setMeleeOn(found !== null && kind !== 'critter');
		} else {
			const found = pickMelee(donors, stats.health);
			setMelee(found);
			setAttacksStats(null);
			setMeleeOn(found !== null && kind !== 'critter');
		}
		noteDerived('melee', sig);
	}, [donors, stats, kind, touched, engine.meleeOnAttacks, sig, noteDerived]);

	useEffect(() => {
		if (touched.has('resist')) return;
		setResist(inferResistances(donors, engine.key));
		noteDerived('resist', sig);
	}, [donors, engine.key, touched, nonce.resist, sig, noteDerived]);

	useEffect(() => {
		if (touched.has('voices') || donors.length === 0) return;
		const drawn = sampleVoices(donors).slice(0, MAX_VOICES);
		// Repetition decides what arrives ticked, not whether the step has
		// anything to show. Gating on it opens the step 6-43% of the time; ranking
		// and offering the lot opens it 78-92%.
		setVoices(drawn.map(item => ({ item, on: item.from.length >= 2 })));
		setVoicesOn(drawn.some(v => v.from.length >= 2));
		setCadence(voiceCadence(donors));
		noteDerived('voices', sig);
	}, [donors, touched, nonce.voices, sig, noteDerived]);

	// Summons are not drawn. Naming a family used to inherit its summon rows, on
	// the same reasoning as the voices and the loot — but a summon is a statement
	// about *other monsters existing*, not a flavour detail, and a wizard that
	// quietly decides a new monster calls two dragons has made a design decision
	// on the user's behalf that they now have to find and undo. The cap still
	// follows the family, because it is only read once a summon is picked.
	useEffect(() => {
		if (touched.has('summons') || donors.length === 0) return;
		setMaxSummons(maxSummonsFor(donors));
	}, [donors, touched]);

	// The draw count follows the donors' own tables. It is set rather than
	// derived so that typing over it stays typed.
	const countSeeded = useRef('');
	useEffect(() => {
		const key = donorSignature(lootDonors);
		if (lootDonors.length === 0 || countSeeded.current === key || touched.has('loot')) return;
		countSeeded.current = key;
		setDrawCount(drawCountFor(lootDonors, MAX_DRAW));
	}, [lootDonors, touched]);

	useEffect(() => {
		if (touched.has('loot') || !hasItems) return;
		if (kind === 'critter' || lootDonors.length === 0) {
			setLoot([]);
			return;
		}
		const drawn = sampleLoot(makeRng((seed ^ 0xbee5) + nonce.loot), lootDonors, dropped, items, drawCount, lootIds);
		setLoot(drawn.map(item => ({ item, on: true })));
	}, [lootDonors, lootIds, dropped, items, seed, nonce.loot, kind, hasItems, touched, drawCount]);

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

	/** The loot picks never touch the band. They are a statement about drops, and
	 *  "drops like a dragon" must not quietly make the monster worth a dragon. */
	const toggleLootSimilar = useCallback(
		(m: MonsterSummary) => {
			setLootSimilar(prev => {
				const base = prev ?? similar;
				const on = base.some(x => x.file === m.file);
				if (!on && base.length >= MAX_SIMILAR) return base;
				return on ? base.filter(x => x.file !== m.file) : [...base, m];
			});
		},
		[similar]
	);

	const openIndex = Math.min(active, Math.max(0, abilities.length - 1));
	const open = abilities[openIndex] ?? null;
	const openDefenseIndex = Math.min(activeDefense, Math.max(0, defenses.length - 1));
	const openDefense = defenses[openDefenseIndex] ?? null;

	// Where an ability's lints sit in the document being linted: melee, when it
	// is on, is `attacks[0]`. Defenses have no such offset — melee always lives
	// in `attacks`, whatever the engine.
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

	/** A new defense opens on healing, which is what a defense block is for in
	 *  nine files out of ten. */
	const addDefense = useCallback(() => {
		mark('defenses');
		setDefenses(prev => {
			setActiveDefense(prev.length);
			return [...prev, { ...blankSpell('defenses'), name: 'healing', melee: null }];
		});
	}, [mark]);

	/** A summon and a voice line of the user's own. Both are appended ticked —
	 *  a row you typed is one you meant — and both are what Enter does inside
	 *  their fields, so a list is written by typing rather than by reaching for
	 *  the button between every entry. */
	/** The summon rows as monsters, so the picker can show what is already
	 *  chosen. Matched by name because that is what the format stores — a summon
	 *  is a name, not a file — and lower-cased because the loader's own lookup is
	 *  case-insensitive. */
	const summonPicks = useMemo(() => {
		const names = new Set(summons.map(s => s.item.entry.name.trim().toLowerCase()).filter(Boolean));
		return monsters.filter(m => names.has(m.name.trim().toLowerCase()));
	}, [summons, monsters]);

	/** Picking a monster adds a summon row for it; picking it again removes it.
	 *  New rows arrive ticked and carry the engine's own defaults, so a summon is
	 *  one click and the numbers are there to adjust rather than to invent. */
	const toggleSummon = useCallback(
		(m: MonsterSummary) => {
			mark('summons');
			setSummons(prev => {
				const at = prev.findIndex(s => s.item.entry.name.trim().toLowerCase() === m.name.trim().toLowerCase());
				if (at >= 0) return prev.filter((_, i) => i !== at);
				return [...prev, { item: { entry: blankSummon(m.name), from: null, corpusCount: 0 }, on: true }];
			});
		},
		[mark]
	);

	const addVoice = useCallback(() => {
		mark('voices');
		setVoices(prev => [...prev, { item: { line: { sentence: '', yell: false }, from: [] }, on: true }]);
	}, [mark]);

	/** Enter inside a list field adds the next row instead of advancing the step.
	 *  The modal's own Enter is what moves the wizard on, and it must not fire
	 *  while someone is halfway through writing a monster's lines. */
	const addOnEnter = useCallback(
		(add: () => void) => (e: React.KeyboardEvent) => {
			if (e.key !== 'Enter' || e.shiftKey) return;
			e.stopPropagation();
			e.preventDefault();
			add();
		},
		[]
	);

	// A cell clicked in the browser lands here on the way back. Marked touched,
	// like any other answer the user gave with their own hands: the generator
	// must not redraw it when they step back and change the band.
	useEffect(() => {
		if (!picked) return;
		if (picked.kind === 'outfit') {
			mark('look');
			const type = picked.ids[0] ?? 0;
			const colourable = outfits.find(o => o.id === type)?.layers ?? 0;
			setLook(l => ({ ...l, type, from: null, colourable: colourable > 1 }));
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
					const fresh = ids.map((id, i) => ({ id, name: infos[i]?.name })).filter(x => !have.has(x.id));
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
			} else if (step === SUMMON_DETAIL_STEP && summonFx) {
				// Routed by the row that asked rather than by the open card, because
				// summon rows are all open at once — there is no "current" one for
				// the answer to fall back to.
				mark('summons');
				const { index, field } = summonFx;
				setSummons(prev =>
					prev.map((s, j) => (j === index ? { ...s, item: { ...s.item, entry: { ...s.item.entry, [field]: found.name } } } : s))
				);
				setSummonFx(null);
			} else if (step === DEFEND_STEP) {
				mark('defenses');
				setDefenses(prev =>
					prev.map((b, j) =>
						j === openDefenseIndex
							? { ...b, effects: area ? { ...b.effects, areaEffect: found.name } : { ...b.effects, shootEffect: found.name } }
							: b
					)
				);
			} else {
				setAbilities(prev =>
					prev.map((b, j) =>
						j === openIndex
							? { ...b, effects: area ? { ...b.effects, areaEffect: found.name } : { ...b.effects, shootEffect: found.name } }
							: b
					)
				);
			}
		}
		onPickUsed();
		// `summonFx` belongs here: it is read above, and it is set on the way out
		// to the browser. Without it the closure that handles the answer is the one
		// from before the question was asked, which still has it null — the summon
		// branch never fires and the effect lands on an ability instead.
	}, [picked, mark, onPickUsed, engine.key, custom, openIndex, openDefenseIndex, step, summonFx, itemIndex, outfits, showToast, t]);

	// ---- The document, assembled ----
	const assemble = useCallback(
		(base: MonsterDoc): MonsterDoc => {
			const resistance = applyResistances(resist, donors, lead, engine.key);
			// A row left blank is a row the user started and did not finish, not an
			// answer: an empty sentence or a nameless summon is junk in the file the
			// server would carry forever, so neither is written.
			const onVoices = voicesOn
				? voices.filter(v => v.on && v.item.line.sentence.trim() !== '').map(v => ({ ...v.item.line, sentence: v.item.line.sentence.trim() }))
				: [];
			// Picking nothing is the `no`; there is no separate tick to consult.
			const onSummons = summons
				.filter(s => s.on && s.item.entry.name.trim() !== '')
				.map(s => ({ ...s.item.entry, name: s.item.entry.name.trim() }));
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
				look: { ...base.look, type: look.type, head: look.head, body: look.body, legs: look.legs, feet: look.feet, corpse },
				flags: { ...base.flags, ...flagsFor(engine, kind) },
				// Inferred across the whole named set rather than copied off one of
				// them, and written back in whichever of the two spellings the family
				// itself uses — see `applyResistances`.
				immunities: resistance.immunities,
				elements: resistance.elements,
				attacksStats: engine.meleeOnAttacks && meleeOn ? attacksStats ?? base.attacksStats : base.attacksStats,
				attacks: [...(meleeOn && melee ? [melee.block] : []), ...abilities],
				defenses,
				voices: { ...base.voices, interval: cadence.interval, chance: cadence.chance, lines: onVoices },
				// Zero maxSummons means the monster never summons however many
				// entries it carries — a warning, and one the rail used to filter out.
				summons: { maxSummons: onSummons.length > 0 ? maxSummons : base.summons.maxSummons, entries: onSummons },
				loot: loot.filter(l => l.on).map(l => l.item.entry)
			};
		},
		[
			donors,
			lead,
			name,
			race,
			raceid,
			engine,
			stats,
			look,
			corpse,
			kind,
			melee,
			meleeOn,
			attacksStats,
			abilities,
			defenses,
			resist,
			voicesOn,
			voices,
			cadence,
			summons,
			maxSummons,
			loot
		]
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

	// Every finding, not just the loud ones. The rail used to show errors and
	// silent findings only — but everything these steps can newly get wrong is a
	// *warning*: an element declared against an immunity, a summon list with
	// maxSummons still zero, a voice chance over 100. Filtering warnings out made
	// the rail quietest exactly where the wizard had most to say.
	const findings = useMemo(
		() => [...lints].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)),
		[lints]
	);
	const loud = findings.filter(l => l.severity !== 'warning');

	// ---- Navigation ----
	const lootStep = hasItems && kind !== 'critter';
	const lastStep = STEP_COUNT - 1;
	const canAdvance = step !== NAME_STEP || name.trim().length > 0;

	// A step whose subject does not exist is stepped over in both directions.
	//
	// This is not the same as a step with nothing to *offer* — the loot step with
	// no item database still appears and says why, rather than listing ids it
	// cannot vouch for. The distinction is whether there is a question left: "how
	// many does it summon, how often, with what effect" is not a question you can
	// ask about a monster that summons nothing, and showing it empty would be
	// asking the user to click past a form about something they just declined.
	//
	// Stepped over rather than hidden after the fact, so `back` never lands on it
	// either — arriving at a dead step by reversing is the same dead end.
	const skipped = useCallback(
		(s: number) => s === SUMMON_DETAIL_STEP && summons.filter(x => x.on).length === 0,
		[summons]
	);

	const next = useCallback(() => {
		setStep(s => {
			let n = Math.min(lastStep, s + 1);
			while (n < lastStep && skipped(n)) n++;
			return n;
		});
	}, [lastStep, skipped]);

	const back = useCallback(() => {
		setStep(s => {
			let n = Math.max(0, s - 1);
			while (n > 0 && skipped(n)) n--;
			return n;
		});
	}, [skipped]);

	/** The steps the dots stand for. A skipped step is not a question this
	 *  monster has, so it is not a dot — a row that stays the same length while
	 *  the number of questions changes is a row that lies about how far along
	 *  you are. */
	const dots = useMemo(() => [...Array(STEP_COUNT).keys()].filter(i => !skipped(i)), [skipped]);

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
	const redraw = useCallback((f: Field) => {
		setTouched(prev => {
			if (!prev.has(f)) return prev;
			const nextSet = new Set(prev);
			nextSet.delete(f);
			return nextSet;
		});
		setNonce(prev => ({ ...prev, [f]: prev[f] + 1 }));
	}, []);

	/** Keeps the user's edit and stops calling it stale — the picks are now what
	 *  this answer was derived from, by decree rather than by derivation. */
	const keepMine = useCallback((f: Field) => noteDerived(f, sig), [noteDerived, sig]);

	const staleNotice = (f: Field, what: string) =>
		stale.has(f) ? (
			<div className="mx-wiz-stale">
				{t('The monsters you named have changed since you edited {{what}}.', { what })}
				<button className="ss-btn ss-btn-ghost ss-ed-mini" onClick={() => redraw(f)}>
					{t('Use theirs')}
				</button>
				<button className="ss-btn ss-btn-ghost ss-ed-mini" onClick={() => keepMine(f)}>
					{t('Keep mine')}
				</button>
			</div>
		) : null;

	const usable = usableBands(bands);
	const bandIndex = band ? bands.indexOf(band) : 0;
	const types = useMemo(() => damageTypes(engine.key), [engine.key]);

	// Width follows the question, and only while the question needs it: the two
	// designers are a card around a visualiser but not until there is something
	// to design, and the picker steps are grids whose names need somewhere to be.
	// Everything else is one thing to answer and reads better narrow.
	const width =
		(step === ABILITY_STEP && abilities.length > 0) || (step === DEFEND_STEP && defenses.length > 0)
			? ' mx-wiz-wide'
			: // A summon step is a monster grid over a table of rows, so it needs the
				// same room the other picker steps do.
				step === SIMILAR_STEP ||
				  step === RESIST_STEP ||
				  step === SAY_STEP ||
				  step === ABILITY_STEP ||
				  step === DEFEND_STEP ||
				  step === SUMMON_STEP ||
			  step === SUMMON_DETAIL_STEP ||
				  (step === DROP_STEP && lootStep)
				? ' mx-wiz-mid'
				: '';

	return (
		// Hidden rather than unmounted while a browser answers a question: the
		// wizard's state *is* the monster, and losing it to fetch one id would make
		// the trip cost more than it saves.
		<div className={hidden ? 'ss-backdrop mx-wiz-away' : 'ss-backdrop'} onMouseDown={onClose}>
			<div className={`ss-modal mx-wiz${width}`} onMouseDown={e => e.stopPropagation()} onKeyDown={onKeyDown}>
				<div className="ss-modal-title">
					{t('New monster')}
					<span className="mx-wiz-steps">
						{dots.map(i => (
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
							// family, and then to one monster. Everything that averages —
							// the band, the resistances, the melee numbers, the drops — is
							// read off the set; everything that is a single decision — the
							// outfit, the corpse, the race — comes off the lead.
							<Step question={t('Is it similar to anything else?')}>
								<MonsterPicker
									monsters={monsters}
									kind={kind}
									band={band}
									picked={similar}
									lead={lead?.file ?? null}
									onToggle={toggleSimilar}
									onLead={setLeadFile}
								/>
								<div className="ss-modal-desc">
									{similar.length === 0
										? t('Nothing named, so nothing is drawn from a family — the wizard falls back to the whole {{kind}} pool.', {
												kind: t(KINDS.find(k => k.key === kind)?.label ?? 'monster').toLowerCase()
											})
										: t('The band, the resistances, the melee and the drops come off all {{count}}; the outfit, corpse and race come off {{lead}}.', {
												count: similar.length,
												lead: lead?.name ?? '—'
											})}
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
								    grid in here that is worse than the real one. Each card's
								    button is that hand-off; the wizard steps aside and takes the
								    answer back. */}
								<div className="mx-wiz-look">
									<div className="mx-wiz-look-card">
										<div className="mx-wiz-look-title">
											{t('Outfit')}
											<button
												className="ss-btn ss-btn-ghost ss-ed-mini"
												title={look.colourable ? t('Draw another colouring') : t('Draw another')}
												onClick={() => redraw('look')}
											>
												<Dices size={13} />
											</button>
										</div>
										<div className="mx-wiz-look-stage">
											<img className="mx-wiz-look-sprite" src={lookUrl({ ...blankLook, ...look, mode: 'type' }, { cell: 128 })} alt="" />
										</div>
										<div className="mx-wiz-look-foot">
											<input
												className="mx-wiz-input mono mx-wiz-look-id"
												type="number"
												title={t('Outfit')}
												value={look.type}
												onChange={e => {
													mark('look');
													const type = Number(e.target.value);
													setLook({ ...look, type, from: null, colourable: (outfits.find(o => o.id === type)?.layers ?? 0) > 1 });
												}}
											/>
											<button className="ss-btn" onClick={() => onBrowse('outfit')}>
												{t('Pick an outfit…')}
											</button>
										</div>
										<div className="mx-wiz-pick-name">
											{look.from
												? look.colourable
													? t('{{name}}’s, recoloured', { name: look.from })
													: t('{{name}}’s', { name: look.from })
												: look.colourable
													? t('drawn, recoloured')
													: ''}
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

								{staleNotice('look', t('the outfit'))}
								{staleNotice('corpse', t('the corpse'))}

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
									{look.from
										? t('The outfit, the corpse and the race all come off {{lead}}, because a body from one monster over another’s corpse is a pair this corpus never writes.', {
												lead: look.from
											})
										: outfits.length === 0
											? t('No client is open, so there is nothing to draw — the outfit is an id, and the server will resolve it.')
											: t('Nothing named to copy from, so the outfit is one no monster in this corpus wears.')}
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
								{/* One generator, no style switch. "Corpus style" rebuilt names
								    out of the fragments this corpus already used, which sounds
								    useful and is not: the corpus is where the name has to *not*
								    already exist, so its output was either a near-duplicate of a
								    monster that is already there or the same word tables with
								    extra steps. Nobody picked it twice. The dice stay — a name
								    you did not have to think of is the point. */}
								<div className="ss-modal-desc">{t('Drawn from the generator’s own word tables.')}</div>

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
														: t('{{count}} monster', { count: band.count })
													: ''}
											</span>
										</div>
									</>
								)}
								{/* Armour and defence are not here: they are how the monster
								    survives, and they live on the step that asks that. */}
								<div className="mx-wiz-stats">
									{stats &&
										(
											[
												['experience', t('Experience')],
												['health', t('Health')],
												['speed', t('Speed')]
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

						{step === ATTACK_STEP && (
							<Step question={t('How does it attack?')}>
								{/* Melee is asked first and asked as a yes or no, because it is the
								    one attack a monster either has or does not. Its damage is not a
								    number you write: the loader derives it from skill and attack, so
								    those are the two fields and the derived figure is shown beside
								    them rather than being editable and ignored. */}
								{engine.meleeOnAttacks ? (
									<div className={attacksStats ? 'mx-wiz-melee' : 'mx-wiz-melee mx-wiz-item-off'}>
										<label className="mx-wiz-card-tick">
											<input
												type="checkbox"
												checked={meleeOn && attacksStats !== null}
												disabled={attacksStats === null}
												onChange={() => {
													mark('melee');
													setMeleeOn(v => !v);
												}}
											/>
											{t('Fights in melee')}
										</label>
										{attacksStats && meleeOn && (
											<>
												<span className="mx-wiz-mini">{t('Skill')}</span>
												<input
													className="mx-wiz-input mono mx-wiz-num"
													type="number"
													min={0}
													value={attacksStats.skill}
													onChange={e => {
														mark('melee');
														setAttacksStats({ ...attacksStats, skill: Number(e.target.value) });
													}}
												/>
												<span className="mx-wiz-mini">{t('Attack')}</span>
												<input
													className="mx-wiz-input mono mx-wiz-num"
													type="number"
													min={0}
													value={attacksStats.attack}
													onChange={e => {
														mark('melee');
														setAttacksStats({ ...attacksStats, attack: Number(e.target.value) });
													}}
												/>
											</>
										)}
										{attacksStats === null && <span className="mx-wiz-item-from">{t('no melee available')}</span>}
									</div>
								) : (
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
										{melee === null && (
											<span
												className="mx-wiz-mini"
												title={t('A melee block is copied off a donor rather than composed, and nothing in this band has one to lend.')}
											>
												{t('no melee available')}
											</span>
										)}
									</div>
								)}
								{staleNotice('melee', t('the melee'))}
							</Step>
						)}

						{step === ABILITY_STEP && (
							// The ability designer, on its own. It was the second half of "How
							// does it fight?" and is the largest single control in the wizard —
							// a rail, a full SpellCard and a live re-enactment — sitting under
							// two number fields that had already been answered. One question
							// per step: the melee numbers are how it swings, this is what else
							// it can do.
							<Step question={t('What attacks can it use?')}>
								{/* The card is the editor's own SpellCard, so the fields offered
								    are the ones the chosen spell family actually reads, spelled
								    the way this engine spells them, with the same live
								    re-enactment behind its eye. */}
								<SpellRail
									blocks={abilities}
									openIndex={openIndex}
									onOpen={setActive}
									emptyNote={t('A monster with only melee is a monster — this step is happy with none.')}
									emptyLabel={t('No attacks yet.')}
								/>
								{open && (
									<div className="mx-wiz-designer">
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
												onBrowseEffect={k => onBrowse(k === 'area' ? 'effect' : 'missile')}
												defaultStaged
											/>
										</CompactProvider>
									</div>
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
											{t('Remove this attack')}
										</button>
									)}
									<button className="ss-btn" onClick={addAbility}>
										<Plus size={14} />
										{t('Add an attack')}
									</button>
								</div>

							</Step>
						)}

						{step === SUMMON_STEP && (
							// Its own question, not a footnote to attacking.
							//
							// It used to live at the bottom of the fight step on the reasoning
							// that most monsters answer no and one name plus two numbers is a
							// row rather than a step. Both facts are true and the conclusion was
							// wrong: a step you answer "no" to in one click costs nothing, while
							// a question buried under the ability designer is one you scroll
							// past. Cheap to decline beats hidden.
							<Step question={t('Does it summon help?')}>
								{/* No yes/no tick. Picking nothing *is* the no, and it is the
								    answer the step opens on — a tick in front of the grid was one
								    more click between the question and the only thing that
								    answers it, and two ways to say the same no.

								    The monsters are picked from the corpus, the same way an
								    outfit is picked — not typed, and not chosen from "what other
								    monsters already summon".

								    That ranking was there to keep the wizard from proposing a
								    name the server cannot find: `summon.unknown` is a *silent*
								    lint, so a summon naming an unknown monster is dropped without
								    a word. Picking from the corpus is a stronger guarantee than
								    the ranking was, not a weaker one — every name on the list
								    demonstrably exists — and it answers the question people
								    actually arrive with, which is "it summons three of these",
								    about a monster nothing else has ever summoned. */}
								<MonsterPicker
									monsters={monsters}
									kind={kind}
									band={band}
									picked={summonPicks}
									lead={null}
									onToggle={toggleSummon}
									onLead={null}
								/>
								<div className="ss-modal-desc">
									{summonPicks.length === 0
										? t('Nothing picked — it summons nothing, and the next question is skipped.')
										: t('Next: how many of each, how often, and with what effect.')}
								</div>
							</Step>
						)}

						{step === SUMMON_DETAIL_STEP && (
							// Reached only when something was picked — see `skipped`. No picker
							// here: the previous step chose the monsters and this one is about
							// the numbers, which is the whole reason the two are separate.
							<Step question={t('How many does it summon?')}>
										<div className="mx-wiz-summons">
											{summons.map((s, i) => {
												const entry = s.item.entry;
												const update = (p: Partial<typeof entry>) => {
													mark('summons');
													setSummons(summons.map((x, j) => (j === i ? { ...x, item: { ...x.item, entry: { ...x.item.entry, ...p } } } : x)));
												};
												// A summon naming a monster the server cannot find is
												// dropped without a word — `summon.unknown` is silent,
												// and it lives on a cross-file pass the wizard's own
												// linting never runs. So the row says so itself.
												const unknown = entry.name.trim() !== '' && !takenNames.has(entry.name.trim().toLowerCase());
												return (
													<div key={i} className={s.on ? 'mx-wiz-summon' : 'mx-wiz-summon mx-wiz-item-off'}>
														<input
															type="checkbox"
															checked={s.on}
															onChange={() => {
																mark('summons');
																setSummons(summons.map((x, j) => (j === i ? { ...x, on: !x.on } : x)));
															}}
														/>
														{/* A name, not a field: it came from the corpus picker, so
														    there is nothing to type and nothing to get wrong. The
														    invalid styling stays for the one case that can still
														    occur — a row inherited from a donor naming a monster
														    this corpus does not have. */}
														<span
															className={unknown ? 'mx-wiz-summon-name ss-ed-invalid' : 'mx-wiz-summon-name'}
															title={
																unknown
																	? t('No monster with this name is registered — the server summons nothing and says nothing.')
																	: entry.name
															}
														>
															{entry.name}
														</span>
														{/* Each label glued to its own field: three numbers on a row
														    wrap on a narrow dialog, and they have to wrap as pairs
														    rather than stranding a label above the box it names. */}
														<span className="mx-wiz-summon-num">
															<span className="mx-wiz-mini">{t('at once')}</span>
															<NumberField
																value={entry.max}
																onChange={v => update({ max: v })}
																min={0}
																max={100}
																width={52}
																title={t('How many of this one may be alive at once')}
															/>
														</span>
														<span className="mx-wiz-summon-num">
															<span className="mx-wiz-mini">{t('Chance')}</span>
															<NumberField
																value={entry.chance}
																onChange={v => update({ chance: v })}
																min={0}
																max={100}
																width={52}
																title={t('Chance the summon fires on each attempt')}
															/>
														</span>
														{engine.summonInterval && (
															<span className="mx-wiz-summon-num">
																<span className="mx-wiz-mini">{t('Interval')}</span>
																<NumberField
																	value={entry.interval}
																	onChange={v => update({ interval: v })}
																	min={1}
																	width={68}
																	title={t('How often it tries, in milliseconds')}
																/>
															</span>
														)}
														{/* Out to the effects browser, like every other picture-shaped
														    question the wizard asks. The popover grid was the wrong
														    control here: it is the editor's, sized for a field with a
														    label above it, and the wizard's whole bargain is that
														    choosing a picture happens in the real browser — its search,
														    its filters, the animation at the client's own rate.

														    Which row asked is held in `summonFx`: the trip out and back
														    keeps nothing but "an effect was chosen", and unlike the spell
														    designer there is no single open card for the answer to fall
														    back to — every summon row is on screen at once. */}
														{engine.summonEffects && (
															<>
																<span className="mx-wiz-summon-num">
																	<span className="mx-wiz-mini">{t('Effect')}</span>
																	<EffectBrowse
																		kind="area"
																		value={entry.effect}
																		engine={engine.key}
																		emptyLabel={t('Pick effect')}
																		onBrowse={() => {
																			setSummonFx({ index: i, field: 'effect' });
																			onBrowse('effect');
																		}}
																		onClear={() => update({ effect: null })}
																	/>
																</span>
																<span className="mx-wiz-summon-num">
																	<span
																		className="mx-wiz-mini"
																		title={t('Played on the summoner as it calls, rather than on what it called.')}
																	>
																		{t('On caster')}
																	</span>
																	<EffectBrowse
																		kind="area"
																		value={entry.masterEffect}
																		engine={engine.key}
																		emptyLabel={t('Pick effect')}
																		onBrowse={() => {
																			setSummonFx({ index: i, field: 'masterEffect' });
																			onBrowse('effect');
																		}}
																		onClear={() => update({ masterEffect: null })}
																	/>
																</span>
															</>
														)}
														<span className="mx-wiz-item-from">
															{s.item.from
																? t('from {{name}}', { name: s.item.from })
																: s.item.corpusCount > 0
																	? t('{{count}} monster summons it', { count: s.item.corpusCount })
																	: t('yours')}
														</span>
														<button
															className="ss-btn ss-btn-ghost ss-ed-mini"
															title={t('Remove')}
															onClick={() => {
																mark('summons');
																setSummons(summons.filter((_, j) => j !== i));
															}}
														>
															<Trash2 size={13} />
														</button>
													</div>
												);
											})}
										</div>
										<div className="mx-wiz-rowend">
											<label className="mx-wiz-field mx-wiz-summon-max">
												<span title={t('Total across all entries — zero means it never summons, whatever the rows say.')}>
													{t('Max live summons')}
												</span>
												<NumberField
													value={maxSummons}
													onChange={v => {
														mark('summons');
														setMaxSummons(v);
													}}
													min={0}
													max={100}
													width={64}
												/>
											</label>
										</div>
								{staleNotice('summons', t('the summons'))}
							</Step>
						)}

						{step === RESIST_STEP && (
							// The passive half of surviving: what it is wearing and what hurts
							// it less. The corpus link that once argued for keeping this with
							// the defensive spells — a monster with defensive spells declares
							// immunities 88-99% of the time — is a correlation between two
							// answers, not an argument for asking them in one breath.
							<Step question={t('How tough is it to hurt?')}>
								<div className="mx-wiz-stats">
									{stats &&
										(
											[
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
														mark('armor');
														setStats({ ...stats, [key]: Number(e.target.value) });
													}}
												/>
											</label>
										))}
								</div>

								<div className="mx-wiz-sub">{t('Resistances')}</div>
								{resist.length === 0 ? (
									<div className="ss-modal-desc">{t('Name a monster or two on the second step and this fills itself in.')}</div>
								) : (
									<div className="mx-wiz-resists">
										{resist.map(r => {
											const row = types.find(x => x.key === r.type);
											return (
												<label key={r.type} className="mx-wiz-resist">
													<span className="mx-wiz-resist-dot" style={{ background: row?.color }} />
													<span className="mx-wiz-resist-name">{t(row?.label ?? r.type)}</span>
													<NumberField
														value={r.percent}
														onChange={v => {
															mark('resist');
															setResist(resist.map(x => (x.type === r.type ? { ...x, percent: v } : x)));
														}}
														min={-100}
														max={100}
														width={64}
														title={t('100 resists everything — an immunity. Negative takes extra damage.')}
													/>
												</label>
											);
										})}
									</div>
								)}
								<div className="ss-modal-desc">
									{donors.length > 0 &&
										t('The middle of what {{count}} named monsters resist. 100 is immunity; negative takes extra.', {
											count: donors.length
										})}{' '}
									{resist.length > 0 && (
										<button className="ss-btn ss-btn-ghost ss-ed-mini" onClick={() => redraw('resist')}>
											{t('Read them again')}
										</button>
									)}
								</div>
								{staleNotice('resist', t('the resistances'))}
							</Step>
						)}

						{step === DEFEND_STEP && (
							// The active half: what it *does* to stay alive. Same shape as the
							// attack step — a rail, one card, a re-enactment — and for the same
							// reason it is not sharing a step with the numbers above it.
							<Step question={t('How does it protect itself?')}>
								<SpellRail
									blocks={defenses}
									openIndex={openDefenseIndex}
									onOpen={setActiveDefense}
									emptyNote={t('Healing, haste, invisibility — what it does to stay alive. None is a valid answer.')}
									emptyLabel={t('No defenses yet.')}
								/>
								{openDefense && (
									<div className="mx-wiz-designer">
										<CompactProvider>
											<SpellCard
												block={openDefense}
												file={file || 'new'}
												onChange={next => {
													mark('defenses');
													setDefenses(defenses.map((b, j) => (j === openDefenseIndex ? next : b)));
												}}
												spells={spellNames}
												engine={engine.key}
												lintAt={suffix => lints.filter(l => l.path === `defenses[${openDefenseIndex}].${suffix}`)}
												readOnly={false}
												parent="defenses"
												look={{ ...blankLook, ...look, mode: 'type' }}
												onBrowseEffect={k => onBrowse(k === 'area' ? 'effect' : 'missile')}
												defaultStaged
											/>
										</CompactProvider>
									</div>
								)}
								<div className="mx-wiz-rowend">
									{openDefense && (
										<button
											className="ss-btn ss-btn-ghost ss-ed-mini"
											onClick={() => {
												mark('defenses');
												setDefenses(defenses.filter((_, j) => j !== openDefenseIndex));
												setActiveDefense(a => Math.max(0, a - 1));
											}}
										>
											{t('Remove this defense')}
										</button>
									)}
									<button className="ss-btn" onClick={addDefense}>
										<Plus size={14} />
										{t('Add a defense')}
									</button>
								</div>
							</Step>
						)}

						{step === SAY_STEP && (
							// Not gated on repetition. "A line said by two of them" opens this
							// step 6-43% of the time, because most families share no line at
							// all; ranked and offered whole it opens 78-92%, and repetition
							// still decides what arrives ticked.
							<Step question={t('Does it have anything to say?')}>
								<label className="mx-wiz-card-tick">
									<input
										type="checkbox"
										checked={voicesOn}
										onChange={() => {
											mark('voices');
											setVoicesOn(v => !v);
										}}
									/>
									{t('It speaks')}
								</label>

								{/* Every line is a text field, not a label: an inherited line is a
								    starting point — half of what makes a voice the monster's own is
								    swapping a word in it — and a monster whose family says nothing
								    still has things to say. */}
								{voicesOn && (
									<>
										<div className="mx-wiz-voices">
											{voices.length === 0 && (
												<div className="ss-modal-desc">{t('None of the monsters you named says anything — write a line yourself below.')}</div>
											)}
											{voices.map((v, i) => {
												const setLine = (p: Partial<typeof v.item.line>) => {
													mark('voices');
													setVoices(voices.map((x, j) => (j === i ? { ...x, item: { ...x.item, line: { ...x.item.line, ...p } } } : x)));
												};
												return (
													<div key={i} className={v.on ? 'mx-wiz-voice' : 'mx-wiz-voice mx-wiz-item-off'}>
														<input
															type="checkbox"
															checked={v.on}
															onChange={() => {
																mark('voices');
																setVoices(voices.map((x, j) => (j === i ? { ...x, on: !x.on } : x)));
															}}
														/>
														<input
															className="mx-wiz-input mx-wiz-voice-input"
															value={v.item.line.sentence}
															placeholder={t('What it says')}
															onChange={e => setLine({ sentence: e.target.value })}
															onKeyDown={addOnEnter(addVoice)}
														/>
														<label className="mx-wiz-mini mx-wiz-voice-yell" title={t('Heard further away; conventionally written in upper case')}>
															<input type="checkbox" checked={v.item.line.yell} onChange={e => setLine({ yell: e.target.checked })} />
															{t('Yell')}
														</label>
														<span className="mx-wiz-item-from">
															{v.item.from.length > 1
																? t('{{count}} of them say it', { count: v.item.from.length })
																: v.item.from.length === 1
																	? t('from {{name}}', { name: v.item.from[0] })
																	: t('yours')}
														</span>
														<button
															className="ss-btn ss-btn-ghost ss-ed-mini"
															title={t('Remove')}
															onClick={() => {
																mark('voices');
																setVoices(voices.filter((_, j) => j !== i));
															}}
														>
															<Trash2 size={13} />
														</button>
													</div>
												);
											})}
										</div>
										<div className="mx-wiz-rowend">
											<button className="ss-btn" onClick={addVoice}>
												<Plus size={14} />
												{t('Add a line')}
											</button>
										</div>
									</>
								)}

								{/* TVP and Nostalrius read neither attribute, and the writer
								    drops both without a word — so the wizard does not collect an
								    answer it knows will vanish. */}
								{voicesOn && engine.voicesCadence && (
									<div className="mx-wiz-fields">
										<label className="mx-wiz-field">
											<span>{t('Interval')}</span>
											<input
												className="mx-wiz-input mono"
												type="number"
												value={cadence.interval}
												onChange={e => {
													mark('voices');
													setCadence({ ...cadence, interval: Number(e.target.value) });
												}}
											/>
										</label>
										<label className="mx-wiz-field">
											<span>{t('Chance')}</span>
											<input
												className="mx-wiz-input mono"
												type="number"
												value={cadence.chance}
												onChange={e => {
													mark('voices');
													setCadence({ ...cadence, chance: Number(e.target.value) });
												}}
											/>
										</label>
									</div>
								)}

								<div className="ss-modal-desc">
									{voices.length === 0
										? t('Nothing drawn to start from — anything you write here is the whole pool.')
										: engine.voicesCadence
											? t('Lines two of them share arrive ticked. Anything naming its own speaker is left out.')
											: t('This engine reads no interval or chance on voices, so there is nothing to set.')}
								</div>
								{staleNotice('voices', t('the voices'))}
							</Step>
						)}

						{step === DROP_STEP && lootStep && (
							// Which items drop is a question for the items browser — the real
							// one, with its filters, its search and its Loot tray — so this
							// step asks the other half: how often, and how many. The rows are
							// a proposal off the loot donors to begin with; the tray adds to
							// them.
							<Step question={t('What does it drop, and how often?')}>
								<div className="mx-wiz-lootfrom">
									<span className="mx-wiz-mini">
										{lootPicks.length === 0
											? t('Drops like nothing in particular.')
											: t('Drops like {{names}}', { names: lootPicks.map(m => m.name).join(', ') })}
									</span>
									<button className="ss-btn ss-btn-ghost ss-ed-mini" onClick={() => setShowLootDonors(v => !v)}>
										{showLootDonors ? t('Done') : t('Drops like something else…')}
									</button>
									{lootSimilar !== null && (
										<button className="ss-btn ss-btn-ghost ss-ed-mini" onClick={() => setLootSimilar(null)}>
											{t('Same as before')}
										</button>
									)}
								</div>
								{showLootDonors && (
									<MonsterPicker
										monsters={monsters}
										kind={kind}
										band={band}
										picked={lootPicks}
										lead={null}
										onToggle={toggleLootSimilar}
										onLead={null}
									/>
								)}

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
									    the button that uses it. Seeded from the donors' own tables,
									    because a boss drops twenty and a bat drops one and no
									    constant is right at both ends. */}
									<span className="mx-wiz-loot-draw">
										<NumberField
											value={drawCount}
											onChange={setDrawCount}
											min={1}
											max={MAX_DRAW}
											hardMax={MAX_DRAW}
											width={56}
											title={t('How many items a draw proposes — as many as the monsters above drop')}
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
									<span className="mx-wiz-mini mx-wiz-loot-total">{t('{{count}} drop', { count: loot.filter(l => l.on).length })}</span>
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
							{lead && <div>{t('look, corpse, race')}: {lead.name}</div>}
							{band && (
								<div>
									{t('stats')}: {band.label} ({fmt(band.count)})
								</div>
							)}
							{donors.length > 0 && (
								<div>
									{t('resistances, melee')}: {donors.map(d => d.name).join(', ')}
								</div>
							)}
							{lootDonors.length > 0 && loot.length > 0 && (
								<div>
									{t('drops')}: {lootDonors.map(d => d.name).join(', ')}
								</div>
							)}
						</div>
						<div className={loud.length > 0 ? 'mx-wiz-lints mx-wiz-lints-bad' : 'mx-wiz-lints'}>
							{findings.length === 0 ? t('No lint findings') : t('{{count}} lint', { count: findings.length })}
						</div>
						{findings.slice(0, 3).map((l, i) => (
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

/** Errors and silent findings first, warnings behind them — the rail shows all
 *  three now, but the order still says which one to read. */
const SEVERITY_ORDER = ['error', 'silent', 'warning'];

function Step({ question, children }: { question: string; children: React.ReactNode }) {
	return (
		<div className="mx-wiz-step">
			<h3 className="mx-wiz-q">{question}</h3>
			{children}
		</div>
	);
}

/** The chip rail above a spell designer: the whole kit, one open at a time. */
function SpellRail({
	blocks,
	openIndex,
	onOpen,
	emptyNote,
	emptyLabel
}: {
	blocks: SpellBlock[];
	openIndex: number;
	onOpen: (i: number) => void;
	emptyNote: string;
	emptyLabel: string;
}) {
	const { t } = useTranslation();
	if (blocks.length === 0)
		return (
			<div className="ss-modal-desc" title={emptyNote}>
				{emptyLabel}
			</div>
		);
	return (
		<div className="mx-wiz-rail">
			{blocks.map((b, i) => (
				<button key={i} className={i === openIndex ? 'mx-wiz-chip mx-wiz-chip-on' : 'mx-wiz-chip'} onClick={() => onOpen(i)}>
					{b.name ?? b.script ?? t('script')}
				</button>
			))}
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
 *
 * `onLead` is what makes the picked row more than a list. One of the picks is
 * the monster this one is *most* like, and it decides the outfit, the corpse
 * and the race by itself — so it has to be nameable rather than being whichever
 * cell happened to be clicked first.
 */
function MonsterPicker({
	monsters,
	kind,
	band,
	picked,
	lead,
	onToggle,
	onLead
}: {
	monsters: MonsterSummary[];
	kind: Kind;
	band: BalanceBand | null;
	picked: MonsterSummary[];
	lead: string | null;
	onToggle: (m: MonsterSummary) => void;
	onLead: ((file: string) => void) | null;
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
			    search and a pick that scrolled away is one nobody can take back.
			    The crown is the lead: one click, and it is what the outfit, the
			    corpse and the race come off. */}
			{picked.length > 0 && (
				<div className="mx-wiz-similar-picked">
					{picked.map(m => (
						<span key={m.file} className={m.file === lead ? 'mx-wiz-similar-chip mx-wiz-similar-chip-lead' : 'mx-wiz-similar-chip'}>
							{onLead && (
								<button
									className="mx-wiz-lead-btn"
									title={m.file === lead ? t('Most like this one') : t('Make this the one it is most like')}
									onClick={() => onLead(m.file)}
								>
									<Crown size={12} />
								</button>
							)}
							<img src={lookUrl(m.look, { cell: 24 })} alt="" />
							{m.name}
							<button className="mx-wiz-lead-btn" title={t('Remove')} onClick={() => onToggle(m)}>
								<X size={12} />
							</button>
						</span>
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
					onDraft={raw =>
						setDraft(
							raw === null || raw.trim() === '' || !Number.isFinite(Number(raw))
								? null
								: Math.max(0, Math.min(MAX_CHANCE, Math.round(Number(raw) * 1000)))
						)
					}
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

/** `n` ids spread across the whole list rather than taken from its head.
 *
 *  `dropped` arrives sorted by id, so a cap meant as a request budget was
 *  quietly a content filter: the lowest 200 ids in the corpus, which on Canary
 *  is 9% of its drop set and all of it from the same corner of items.xml. */
function spread(ids: number[], n: number, salt: number): number[] {
	if (ids.length <= n) return ids;
	const rng = makeRng(salt);
	const out: number[] = [];
	const stride = ids.length / n;
	for (let i = 0; i < n; i++) out.push(ids[Math.min(ids.length - 1, Math.floor(i * stride + rng() * stride))]);
	return out;
}

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
