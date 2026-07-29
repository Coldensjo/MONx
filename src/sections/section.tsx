import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ItemIndex, MonsterDoc, SpellName } from '../monster';
import type { LintAt } from '../fields/Field';

export const SECTION_IDS = [
	'identity',
	'look',
	'combat',
	'attacks',
	'defenses',
	'resistances',
	'loot',
	'summons',
	'voices',
	'events'
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export const SECTION_LABEL: Record<SectionId, string> = {
	identity: 'Identity',
	look: 'Look',
	combat: 'Combat',
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
	return (
		<section className="ss-ed-section" id={`ss-ed-${id}`}>
			<header className="ss-ed-section-head">
				<button type="button" className="ss-ed-section-toggle" onClick={onToggle}>
					{collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
					<h2>{SECTION_LABEL[id]}</h2>
				</button>
				{summary && <span className="ss-ed-section-summary">{summary}</span>}
			</header>
			{!collapsed && <div className="ss-ed-section-body">{children}</div>}
		</section>
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
