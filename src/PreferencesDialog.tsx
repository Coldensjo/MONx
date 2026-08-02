import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EyeOff } from 'lucide-react';
import { DEFAULT_PREFS, visibleSectionIds, type Prefs } from './prefs';
import { SECTION_IDS, SECTION_LABEL, type SectionId } from './sections/section';
import { lookUrl, type MonsterSummary } from './monster';
import LanguagePicker from './LanguagePicker';

interface Props {
	prefs: Prefs;
	/** Applied live — every toggle takes effect in the editor behind the dialog. */
	onChange: (prefs: Prefs) => void;
	/** The corpus as the app sees it — which is to say, without the filtered ones. */
	monsters: MonsterSummary[];
	/** Files filtered out of the corpus, and what they were. The summaries come
	 *  from the backend, which set the documents aside rather than dropping them:
	 *  this dialog is the only place they can still be seen. */
	hidden: string[];
	hiddenMonsters: MonsterSummary[];
	onHiddenChange: (files: string[]) => void;
	onClose: () => void;
}

/**
 * Editor tab preferences: which tabs exist and which one a monster opens on.
 * Changes apply as they are made rather than on an OK button, so the editor
 * behind the dialog shows what the choice means.
 */
export default function PreferencesDialog({
	prefs,
	onChange,
	monsters,
	hidden,
	hiddenMonsters,
	onHiddenChange,
	onClose
}: Props) {
	const { t } = useTranslation();
	const [query, setQuery] = useState('');
	const visible = visibleSectionIds(prefs);
	const isDefault =
		prefs.defaultSection === DEFAULT_PREFS.defaultSection &&
		visible.length === DEFAULT_PREFS.visibleSections.length &&
		visible.every(id => DEFAULT_PREFS.visibleSections.includes(id));

	// The whole corpus, which is the visible one plus the filtered one — this is
	// the only view in the app that puts them back together, and it has to, or
	// there would be no way to reach a monster to unfilter it.
	const all = useMemo(
		() => [...monsters, ...hiddenMonsters].sort((a, b) => a.name.localeCompare(b.name)),
		[monsters, hiddenMonsters]
	);
	const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
	const shown = useMemo(() => {
		const q = query.trim().toLowerCase();
		return q ? all.filter(m => m.name.toLowerCase().includes(q) || m.file.toLowerCase().includes(q)) : all;
	}, [all, query]);

	const toggleHidden = (file: string) =>
		onHiddenChange(hiddenSet.has(file) ? hidden.filter(f => f !== file) : [...hidden, file]);

	const toggle = (id: SectionId) => {
		const next = visible.includes(id) ? visible.filter(v => v !== id) : [...visible, id];
		// The last tab cannot be hidden — the editor would have nothing to show.
		if (next.length === 0) return;
		onChange({ ...prefs, visibleSections: next });
	};

	return (
		<div className="ss-backdrop" onMouseDown={onClose}>
			<div className="ss-modal mx-prefs-modal" onMouseDown={e => e.stopPropagation()}>
				<div className="ss-modal-title">{t('Preferences')}</div>

				{/* Language first: it is the one preference that changes every other
				    word in this dialog, so it should not be below them. */}
				<div className="ss-modal-desc">
					<div className="mx-prefs-default">
						{t('Language')}
						<LanguagePicker size={16} />
					</div>
					<div className="ss-ed-field-note">
						{t('Applies immediately. Only the interface is translated — monster data, item names and engine values are left exactly as the server writes them.')}
					</div>
				</div>

				<div className="ss-modal-desc">
					<label className="mx-prefs-default">
						{t('Open a monster on')}
						<select
							className="ss-ed-input"
							value={prefs.defaultSection}
							onChange={e => onChange({ ...prefs, defaultSection: e.target.value as SectionId })}
						>
							{visible.map(id => (
								<option key={id} value={id}>
									{t(SECTION_LABEL[id])}
								</option>
							))}
						</select>
					</label>
					<div className="ss-ed-field-note">
						{t('Jumped to without animation, every time a monster is opened or a tab is activated.')}
					</div>
				</div>

				{/* Not a view filter — the monster list has one of those. A monster
				    ticked here is taken out of the corpus the backend hands to
				    everything: the sidebar, Ctrl+P, the wizard's donors, the loot and
				    summon pools, the balance bands, the lint totals. Which is why the
				    list on this one screen is the visible corpus *plus* the filtered
				    one: it is the only place left that can show them, and a filter
				    with no way back is a corpus the user has quietly lost. */}
				<div className="ss-modal-desc mx-prefs-hidden-title">
					<EyeOff size={14} />
					{t('Filtered monsters')}
					{hidden.length > 0 && (
						<button type="button" className="ss-btn ss-btn-ghost ss-ed-mini" onClick={() => onHiddenChange([])}>
							{t('Show all again')}
						</button>
					)}
				</div>
				<div className="ss-ed-field-note">
					{hidden.length === 0
						? t('Nothing is filtered. A monster ticked here disappears from the whole app — every list, every tool, every lint — and stays gone after a restart.')
						: t('{{count}} monster is filtered out of this corpus everywhere in the app, and stays that way after a restart.', {
								count: hidden.length
							})}
				</div>
				<input
					className="ss-ed-input mx-prefs-hidden-search"
					value={query}
					onChange={e => setQuery(e.target.value)}
					placeholder={t('Search the corpus…')}
				/>
				<div className="mx-prefs-hidden-list">
					{shown.length === 0 && <div className="ss-ed-field-note">{t('Nothing in this corpus matches.')}</div>}
					{shown.map(m => {
						const off = hiddenSet.has(m.file);
						return (
							<label key={m.file} className={off ? 'mx-prefs-hidden-row mx-prefs-hidden-off' : 'mx-prefs-hidden-row'}>
								<input type="checkbox" checked={off} onChange={() => toggleHidden(m.file)} />
								<img src={lookUrl(m.look, { cell: 24 })} alt="" />
								<span className="mx-prefs-hidden-name">{m.name}</span>
								<span className="mx-prefs-hidden-file">{m.file}</span>
							</label>
						);
					})}
				</div>

				<div className="ss-modal-desc">{t('Tabs')}</div>
				<div className="mx-prefs-tabs">
					{SECTION_IDS.map(id => (
						<label key={id} className="mx-prefs-tab">
							<input type="checkbox" checked={visible.includes(id)} onChange={() => toggle(id)} />
							{t(SECTION_LABEL[id])}
						</label>
					))}
				</div>
				<div className="ss-ed-field-note">
					{t('A hidden tab keeps its data — the file is written whole either way. {{tab}} is hidden by default.', {
						tab: t(SECTION_LABEL.events)
					})}
				</div>

				<div className="ss-modal-buttons">
					<button
						type="button"
						className="ss-btn"
						disabled={isDefault}
						onClick={() => onChange(DEFAULT_PREFS)}
					>
						{t('Restore defaults')}
					</button>
					<div className="ss-modal-buttons-spacer" />
					<button type="button" className="ss-btn ss-btn-primary" onClick={onClose}>
						{t('Close')}
					</button>
				</div>
			</div>
		</div>
	);
}
