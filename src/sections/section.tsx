import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, ClipboardPaste, ClipboardPlus, Copy } from 'lucide-react';
import type { ItemIndex, MonsterDoc, SpellName } from '../monster';
import type { LintAt } from '../fields/Field';
import { BLOCK_LABEL, isBlockKind, useBlocks } from '../blocks';

export const SECTION_IDS = [
	'identity',
	'look',
	'bestiary',
	'combat',
	'strategy',
	'attacks',
	'defenses',
	'resistances',
	'loot',
	'summons',
	'voices',
	'events'
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

/**
 * Sections that only exist on some engines, keyed by the `EngineInfo` flag that
 * decides. Anything absent from this table is universal.
 *
 * A section the engine does not have is not merely hidden — it is not offered in
 * Preferences either, so a tab cannot be resurrected for a workspace whose
 * server has never heard of it.
 */
export const SECTION_ENGINE_FLAG: Partial<Record<SectionId, 'bestiary' | 'targetStrategy'>> = {
	bestiary: 'bestiary',
	strategy: 'targetStrategy'
};

/** Values are i18n keys — translated at the render site with t(). */
export const SECTION_LABEL: Record<SectionId, string> = {
	identity: 'Identity',
	look: 'Look',
	bestiary: 'Bestiary',
	combat: 'Combat',
	strategy: 'Target strategy',
	attacks: 'Attacks',
	defenses: 'Defenses',
	resistances: 'Resistances',
	loot: 'Loot',
	summons: 'Summons',
	voices: 'Voices',
	events: 'Pacifist & Events'
};

/** Everything a section needs. `patch` takes a whole-doc partial so no section
    ever mutates the document it was handed (DESIGN §10). */
export interface SectionProps {
	doc: MonsterDoc;
	patch: (p: Partial<MonsterDoc>) => void;
	lintAt: LintAt;
	items: ItemIndex;
	spells: SpellName[];
	/** `.lua` files present in monster/scripts — Identity's script dropdown. */
	scripts: string[];
	/** Registered monster names, for summon-name validation (§14). */
	monsterNames: string[];
	nextRaceid: number | null;
	readOnly: boolean;
	onBrowseOutfits?: () => void;
	/** Opens the Items browser pre-filtered to corpses, for the Look section's corpse picker. */
	onBrowseCorpses?: () => void;
	/** Opens the Items browser unfiltered, for the Look section's typeex picker. */
	onBrowseItems?: () => void;
}

interface ShellProps {
	id: SectionId;
	collapsed: boolean;
	onToggle: () => void;
	/** Right-hand summary in the header: counts, totals, the one-line state. */
	summary?: ReactNode;
	children: ReactNode;
}

export function Section({ id, collapsed, onToggle, summary, children }: ShellProps) {
	const { t } = useTranslation();
	return (
		<section className="ss-ed-section" id={`ss-ed-${id}`}>
			<header className="ss-ed-section-head">
				<button type="button" className="ss-ed-section-toggle" onClick={onToggle}>
					{collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
					<h2>{t(SECTION_LABEL[id])}</h2>
				</button>
				{summary && <span className="ss-ed-section-summary">{summary}</span>}
				<BlockButtons id={id} />
			</header>
			{!collapsed && <div className="ss-ed-section-body">{children}</div>}
		</section>
	);
}

/**
 * Copy / paste for the section's own slice of the document. Rendered here
 * rather than in each section so the six that carry a block need no changes of
 * their own — the shell provides the controls through context, and a section
 * rendered without it (fixtures) simply has no buttons.
 */
function BlockButtons({ id }: { id: SectionId }) {
	const { t } = useTranslation();
	const blocks = useBlocks();
	if (!blocks || !isBlockKind(id)) return null;
	const held = blocks.clipboard?.kind === id ? blocks.clipboard : null;
	const label = t(BLOCK_LABEL[id]);
	return (
		<span className="ss-ed-section-blocks">
			<button
				type="button"
				className="ss-btn ss-btn-ghost ss-ed-mini"
				title={t('Copy this monster’s {{block}}', { block: label })}
				onClick={() => blocks.copy(id)}
			>
				<Copy size={13} />
			</button>
			<button
				type="button"
				className="ss-btn ss-btn-ghost ss-ed-mini"
				disabled={!held || blocks.readOnly}
				title={
					held
						? t('Replace with {{count}} {{block}} from {{monster}}', {
								count: held.count,
								block: label,
								monster: held.from
							})
						: t('No {{block}} copied', { block: label })
				}
				onClick={() => blocks.paste(id, 'replace')}
			>
				<ClipboardPaste size={13} />
			</button>
			<button
				type="button"
				className="ss-btn ss-btn-ghost ss-ed-mini"
				disabled={!held || blocks.readOnly}
				title={
					held
						? t('Add {{count}} {{block}} from {{monster}} to what is here', {
								count: held.count,
								block: label,
								monster: held.from
							})
						: t('No {{block}} copied', { block: label })
				}
				onClick={() => blocks.paste(id, 'merge')}
			>
				<ClipboardPlus size={13} />
			</button>
		</span>
	);
}

/** A labelled sub-block inside a section (flag groups, geometry, status). */
export function SubGroup({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
	return (
		<div className="ss-ed-subgroup">
			<div className="ss-ed-subgroup-title">{title}</div>
			{note && <div className="ss-ed-field-note">{note}</div>}
			{children}
		</div>
	);
}

export function Banner({ kind, children }: { kind: 'info' | 'warn' | 'error'; children: ReactNode }) {
	return <div className={`ss-ed-banner ss-ed-banner-${kind}`}>{children}</div>;
}
