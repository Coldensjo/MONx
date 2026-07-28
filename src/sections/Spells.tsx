import { Plus } from 'lucide-react';
import type { SpellBlock } from '../monster';
import { SortableList } from '../fields/SortableList';
import { Section, type SectionId, type SectionProps } from './section';
import { SpellCard } from './SpellCard';

interface Props extends SectionProps {
	which: 'attacks' | 'defenses';
	collapsed: boolean;
	onToggle: (id: SectionId) => void;
}

function blankSpell(which: 'attacks' | 'defenses'): SpellBlock {
	// Defaults chosen from what each parent overwhelmingly holds (§9.5): melee
	// leads the attack list, healing leads the defense list.
	const attack = which === 'attacks';
	return {
		kind: 'builtin',
		name: attack ? 'melee' : 'healing',
		script: null,
		interval: 2000,
		chance: attack ? 100 : 15,
		range: attack ? 1 : 0,
		min: 0,
		max: 0,
		target: false,
		direction: false,
		area: null,
		melee: attack ? { skill: 0, attack: 0, condition: null } : null,
		condition: null,
		status: null,
		effects: { shootEffect: null, areaEffect: null, aoeShootEffect: false }
	};
}

export function Spells({ which, doc, patch, lintAt, spells, readOnly, collapsed, onToggle }: Props) {
	const blocks = which === 'attacks' ? doc.attacks : doc.defenses;
	const setBlocks = (next: SpellBlock[]) => patch(which === 'attacks' ? { attacks: next } : { defenses: next });
	const id: SectionId = which === 'attacks' ? 'attacks' : 'defenses';

	return (
		<Section
			id={id}
			collapsed={collapsed}
			onToggle={() => onToggle(id)}
			summary={blocks.length === 1 ? '1 spell' : `${blocks.length} spells`}
		>
			<SortableList
				items={blocks}
				onChange={setBlocks}
				list={which}
				keyOf={(_, i) => String(i)}
				disabled={readOnly}
				empty={which === 'attacks' ? 'No attacks — this monster cannot hurt anything.' : 'No defenses.'}
				renderRow={(block, i) => (
					<SpellCard
						block={block}
						onChange={next => setBlocks(blocks.map((b, j) => (j === i ? next : b)))}
						spells={spells}
						lintAt={suffix => lintAt(`${which}[${i}].${suffix}`)}
						readOnly={readOnly}
						parent={which}
					/>
				)}
			/>
			<button
				type="button"
				className="ss-btn"
				disabled={readOnly}
				onClick={() => setBlocks([...blocks, blankSpell(which)])}
			>
				<Plus size={14} />
				Add {which === 'attacks' ? 'attack' : 'defense'}
			</button>
		</Section>
	);
}
