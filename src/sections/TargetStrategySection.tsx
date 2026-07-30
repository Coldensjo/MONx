import type { TargetStrategy } from '../monster';
import { Field } from '../fields/Field';
import { NumberField } from '../fields/NumberField';
import { Section, type SectionId, type SectionProps } from './section';

interface Props extends SectionProps {
	collapsed: boolean;
	onToggle: (id: SectionId) => void;
}

const BLANK: TargetStrategy = { nearest: 100, weakest: 0, mostdamage: 0, random: 0 };

const KEYS: { key: keyof TargetStrategy; label: string; hint: string }[] = [
	{ key: 'nearest', label: 'Nearest', hint: 'closest enemy' },
	{ key: 'weakest', label: 'Weakest', hint: 'lowest health' },
	{ key: 'mostdamage', label: 'Most damage', hint: 'biggest threat so far' },
	{ key: 'random', label: 'Random', hint: 'anyone in range' }
];

/**
 * `<targetstrategy>` — how the monster picks whom to attack. TVP and Nostalrius
 * only; Ironcore's `<targetstrategies>` is a different node with different keys
 * and rides along untouched.
 *
 * TVP warns when the four weights do not add up to exactly 100, so the total is
 * shown rather than left for the linter alone to mention.
 */
export function TargetStrategySection({ doc, patch, lintAt, readOnly, collapsed, onToggle }: Props) {
	const strategy = doc.targetStrategy ?? BLANK;
	const total = strategy.nearest + strategy.weakest + strategy.mostdamage + strategy.random;

	return (
		<Section
			id="strategy"
			collapsed={collapsed}
			onToggle={() => onToggle('strategy')}
			summary={total === 100 ? 'weights total 100' : `weights total ${total}`}
		>
			<div className="ss-ed-card-grid">
				{KEYS.map(({ key, label, hint }) => (
					<Field key={key} label={label} hint={hint} lints={lintAt('targetStrategy')}>
						<NumberField
							value={strategy[key]}
							onChange={v => patch({ targetStrategy: { ...strategy, [key]: v } })}
							min={0}
							max={100}
							width={100}
							disabled={readOnly}
						/>
					</Field>
				))}
			</div>
			{total !== 100 && (
				<div className="ss-ed-note" data-tone="warn">
					The four weights add up to {total}. The server expects exactly 100 and complains on load.
				</div>
			)}
		</Section>
	);
}
