import { DEFAULT_PREFS, visibleSectionIds, type Prefs } from './prefs';
import { SECTION_IDS, SECTION_LABEL, type SectionId } from './sections/section';

interface Props {
	prefs: Prefs;
	/** Applied live — every toggle takes effect in the editor behind the dialog. */
	onChange: (prefs: Prefs) => void;
	onClose: () => void;
}

/**
 * Editor tab preferences: which tabs exist and which one a monster opens on.
 * Changes apply as they are made rather than on an OK button, so the editor
 * behind the dialog shows what the choice means.
 */
export default function PreferencesDialog({ prefs, onChange, onClose }: Props) {
	const visible = visibleSectionIds(prefs);
	const isDefault =
		prefs.defaultSection === DEFAULT_PREFS.defaultSection &&
		visible.length === DEFAULT_PREFS.visibleSections.length &&
		visible.every(id => DEFAULT_PREFS.visibleSections.includes(id));

	const toggle = (id: SectionId) => {
		const next = visible.includes(id) ? visible.filter(v => v !== id) : [...visible, id];
		// The last tab cannot be hidden — the editor would have nothing to show.
		if (next.length === 0) return;
		onChange({ ...prefs, visibleSections: next });
	};

	return (
		<div className="ss-backdrop" onMouseDown={onClose}>
			<div className="ss-modal mx-prefs-modal" onMouseDown={e => e.stopPropagation()}>
				<div className="ss-modal-title">Preferences</div>

				<div className="ss-modal-desc">
					<label className="mx-prefs-default">
						Open a monster on
						<select
							className="ss-ed-input"
							value={prefs.defaultSection}
							onChange={e => onChange({ ...prefs, defaultSection: e.target.value as SectionId })}
						>
							{visible.map(id => (
								<option key={id} value={id}>
									{SECTION_LABEL[id]}
								</option>
							))}
						</select>
					</label>
					<div className="ss-ed-field-note">
						Jumped to without animation, every time a monster is opened or a tab is activated.
					</div>
				</div>

				<div className="ss-modal-desc">Tabs</div>
				<div className="mx-prefs-tabs">
					{SECTION_IDS.map(id => (
						<label key={id} className="mx-prefs-tab">
							<input type="checkbox" checked={visible.includes(id)} onChange={() => toggle(id)} />
							{SECTION_LABEL[id]}
						</label>
					))}
				</div>
				<div className="ss-ed-field-note">
					A hidden tab keeps its data — the file is written whole either way. Pacifist &amp; Events is hidden by
					default.
				</div>

				<div className="ss-modal-buttons">
					<button
						type="button"
						className="ss-btn"
						disabled={isDefault}
						onClick={() => onChange(DEFAULT_PREFS)}
					>
						Restore defaults
					</button>
					<div className="ss-modal-buttons-spacer" />
					<button type="button" className="ss-btn ss-btn-primary" onClick={onClose}>
						Close
					</button>
				</div>
			</div>
		</div>
	);
}
