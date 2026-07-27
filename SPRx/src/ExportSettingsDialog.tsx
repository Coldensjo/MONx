import { useState } from 'react';
import { FolderOpen, RotateCcw } from 'lucide-react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
	DEFAULT_EXPORT_SETTINGS,
	ExportSettings,
	SheetArrangement
} from './settings';
import type { SheetAlign } from './spr';

interface Props {
	settings: ExportSettings;
	onSave: (settings: ExportSettings) => void;
	onClose: () => void;
}

/** Local draft where numeric fields are strings so inputs can be cleared while typing. */
interface Draft {
	arrangement: SheetArrangement;
	gridBy: 'cols' | 'rows';
	gridCount: string;
	spacing: string;
	align: SheetAlign;
	useFixedFolder: boolean;
	fixedFolder: string;
}

function toDraft(s: ExportSettings): Draft {
	return {
		arrangement: s.arrangement,
		gridBy: s.gridBy,
		gridCount: String(s.gridCount),
		spacing: String(s.spacing),
		align: s.align,
		useFixedFolder: s.useFixedFolder,
		fixedFolder: s.fixedFolder
	};
}

/**
 * Presets dialog for the combined-spritesheet export. Values saved here become
 * the defaults each time the export dialog is opened, persisted across sessions.
 */
export default function ExportSettingsDialog({ settings, onSave, onClose }: Props) {
	const [draft, setDraft] = useState<Draft>(() => toDraft(settings));

	const pickFolder = async () => {
		const dir = await openDialog({ directory: true, title: 'Choose a fixed export folder' });
		if (typeof dir === 'string') {
			setDraft(d => ({ ...d, useFixedFolder: true, fixedFolder: dir }));
		}
	};

	const save = () => {
		onSave({
			arrangement: draft.arrangement,
			gridBy: draft.gridBy,
			gridCount: Math.max(1, Math.min(999, parseInt(draft.gridCount, 10) || 1)),
			spacing: Math.max(0, Math.min(256, parseInt(draft.spacing, 10) || 0)),
			align: draft.align,
			useFixedFolder: draft.useFixedFolder && draft.fixedFolder.length > 0,
			fixedFolder: draft.fixedFolder
		});
		onClose();
	};

	return (
		<div className="ss-backdrop" onMouseDown={onClose}>
			<div className="ss-modal" onMouseDown={e => e.stopPropagation()}>
				<div className="ss-modal-title">Export settings</div>
				<div className="ss-modal-desc">Default layout for combined spritesheets.</div>

				<div className="ss-field">
					<span className="ss-field-label">Arrangement</span>
					<select
						value={draft.arrangement}
						onChange={e => setDraft(d => ({ ...d, arrangement: e.target.value as SheetArrangement }))}
					>
						<option value="vertical">Vertical — single column</option>
						<option value="horizontal">Horizontal — single row</option>
						<option value="grid">Grid</option>
					</select>
				</div>

				{draft.arrangement === 'grid' && (
					<div className="ss-field-row">
						<div className="ss-field">
							<span className="ss-field-label">Fixed</span>
							<select
								value={draft.gridBy}
								onChange={e => setDraft(d => ({ ...d, gridBy: e.target.value as 'cols' | 'rows' }))}
							>
								<option value="cols">Columns</option>
								<option value="rows">Rows</option>
							</select>
						</div>
						<div className="ss-field">
							<span className="ss-field-label">Count</span>
							<input
								type="number"
								min={1}
								max={999}
								value={draft.gridCount}
								onChange={e => setDraft(d => ({ ...d, gridCount: e.target.value }))}
								onKeyDown={e => e.key === 'Enter' && save()}
							/>
						</div>
					</div>
				)}

				<div className="ss-field-row">
					<div className="ss-field">
						<span className="ss-field-label">Spacing (px)</span>
						<input
							type="number"
							min={0}
							max={256}
							value={draft.spacing}
							onChange={e => setDraft(d => ({ ...d, spacing: e.target.value }))}
							onKeyDown={e => e.key === 'Enter' && save()}
						/>
					</div>
					<div className="ss-field">
						<span className="ss-field-label">Align</span>
						<select
							value={draft.align}
							onChange={e => setDraft(d => ({ ...d, align: e.target.value as SheetAlign }))}
						>
							<option value="start">Start</option>
							<option value="center">Center</option>
							<option value="end">End</option>
						</select>
					</div>
				</div>

				<div className="ss-field">
					<label className="ss-toggle">
						<input
							type="checkbox"
							checked={draft.useFixedFolder}
							onChange={e => {
								const checked = e.target.checked;
								if (checked && !draft.fixedFolder) {
									void pickFolder();
								} else {
									setDraft(d => ({ ...d, useFixedFolder: checked }));
								}
							}}
						/>
						Always export to a fixed folder
					</label>
					<span className="ss-field-label">
						Skips the save dialog and exports straight here. Each file gets a unique name so
						repeat exports never overwrite one another.
					</span>
					{draft.useFixedFolder && (
						<div className="ss-field-row">
							<div className="ss-field">
								<input type="text" value={draft.fixedFolder} readOnly title={draft.fixedFolder} />
							</div>
							<button className="ss-btn ss-btn-ghost" onClick={() => void pickFolder()} title="Choose folder…">
								<FolderOpen size={14} />
								Choose…
							</button>
						</div>
					)}
				</div>

				<div className="ss-modal-buttons">
					<button
						className="ss-btn ss-btn-ghost"
						onClick={() => setDraft(toDraft(DEFAULT_EXPORT_SETTINGS))}
						title="Reset fields to defaults"
					>
						<RotateCcw size={14} />
						Reset
					</button>
					<span className="ss-modal-buttons-spacer" />
					<button className="ss-btn" onClick={onClose}>
						Cancel
					</button>
					<button className="ss-btn ss-btn-primary" onClick={save}>
						Save
					</button>
				</div>
			</div>
		</div>
	);
}
