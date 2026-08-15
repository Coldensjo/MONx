// The items grid + loot tray + item context menu — the one place in MONx
// that lets you pick an item for the open monster (loot, corpse, typeex) or
// for the create wizard. Bare content, no modal chrome: `Workspace.tsx`
// renders it inline for the rail's "Items" view, and `ItemPickDialog` wraps
// it in a backdrop for the Loot/Look section "Select…" buttons and the
// wizard's corpse/loot steps. Moving this out of `Workspace.tsx` verbatim —
// same JSX, same closures passed in as props — is what let the sidebar swap
// happen without breaking loot-picking (see the plan this came from).

import { useTranslation } from 'react-i18next';
import { Bookmark, Package, Percent, PersonStanding, Plus, Skull, Star, Trash2, Users } from 'lucide-react';
import ThingBrowser, { type Filter } from './ThingBrowser';
import { itemUrl, type ItemInfo, type MonsterDoc } from './monster';
import type { LootPreset } from './lootpresets';
import type { WizardPickKind } from './Workspace';

export interface ItemPickPanelProps {
	itemList: ItemInfo[];
	itemRowUrl: (visible: ItemInfo[], cell: number) => string;
	itemKey: (i: ItemInfo) => number;
	itemLabel: (i: ItemInfo) => string;
	itemSearchText: (i: ItemInfo) => string;
	itemSearchId: (i: ItemInfo) => number;
	itemCellTitle: (i: ItemInfo) => string;
	itemIsFavourite: (i: ItemInfo) => boolean;
	itemCellFrames: (i: ItemInfo) => number;
	itemCellUrl: (i: ItemInfo, frame: number) => string;
	itemFilters: Filter<ItemInfo>[];
	initialFilters: string[];
	/** Which wizard step is borrowing this panel, if any — only `kind` is
	 *  needed here; `Workspace` keeps track of which view to restore. */
	wizardPickKind: WizardPickKind | null;
	finishWizardPick: (ids: number[]) => void;
	addToTray: (picked: ItemInfo[]) => void;
	itemContextMenu: (item: ItemInfo, e: React.MouseEvent, selected: ItemInfo[]) => void;
	itemMenu: { x: number; y: number; item: ItemInfo; items: ItemInfo[] } | null;
	onCloseItemMenu: () => void;
	openUsage: (item: ItemInfo) => void;
	toggleFavourites: (picked: ItemInfo[]) => void;
	favourites: Set<number>;
	/** Gates "Scale drop chance…" — the scaler rewrites files from disk. */
	dirty: boolean;
	onScaleDropChance: (itemId: number) => void;
	showToast: (kind: 'ok' | 'error', message: string) => void;
	doc: MonsterDoc | null;
	addToMonsterLoot: (picked: ItemInfo[]) => void;
	setAsCorpse: (item: ItemInfo) => void;
	setAsTypeex: (item: ItemInfo) => void;
	lootTray: ItemInfo[];
	onClearTray: () => void;
	addTrayToMonster: () => void;
	presets: LootPreset[];
	onSavePreset: () => void;
	onLoadPreset: (p: LootPreset) => void;
	onManagePresets: () => void;
	/** Fires after a pick that commits straight to the monster — the tray's
	 *  primary button, or a context-menu action that skips the tray entirely
	 *  (Add to loot for X / Set as corpse / Set as typeex). Unset when this
	 *  panel is the rail's own Items view, where there is no dialog to close.
	 *  Filling the tray itself (double-click, "Add N item to Loot") does not
	 *  fire this — that path is for collecting several items in one visit. */
	onPicked?: () => void;
}

export default function ItemPickPanel(props: ItemPickPanelProps) {
	const { t } = useTranslation();
	const {
		itemList,
		itemRowUrl,
		itemKey,
		itemLabel,
		itemSearchText,
		itemSearchId,
		itemCellTitle,
		itemIsFavourite,
		itemCellFrames,
		itemCellUrl,
		itemFilters,
		initialFilters,
		wizardPickKind,
		finishWizardPick,
		addToTray,
		itemContextMenu,
		itemMenu,
		onCloseItemMenu,
		openUsage,
		toggleFavourites,
		favourites,
		dirty,
		onScaleDropChance,
		showToast,
		doc,
		addToMonsterLoot,
		setAsCorpse,
		setAsTypeex,
		lootTray,
		onClearTray,
		addTrayToMonster,
		presets,
		onSavePreset,
		onLoadPreset,
		onManagePresets,
		onPicked
	} = props;

	return (
		<>
			<ThingBrowser<ItemInfo>
				items={itemList}
				rowAtlasUrl={itemRowUrl}
				cellKey={itemKey}
				cellLabel={itemLabel}
				searchText={itemSearchText}
				searchId={itemSearchId}
				cellTitle={itemCellTitle}
				cellMark={itemIsFavourite}
				cellFrames={itemCellFrames}
				cellUrl={itemCellUrl}
				filters={itemFilters}
				initialFilters={initialFilters}
				searchMode="filter"
				selectionMode="multi"
				view="items"
				draggable
				dragPayload={i => ({
					kind: 'item',
					serverId: i.serverId,
					name: i.name,
					container: i.container
				})}
				// Off while a single cell is the answer — a menu offering to make
				// this the corpse of the monster behind the wizard is a trap.
				// A loot pick keeps it: "Add N item to Loot" on a multi-selection
				// is how the tray is meant to be filled.
				onContextMenu={wizardPickKind && wizardPickKind !== 'loot' ? undefined : itemContextMenu}
				onPick={i => {
					if (wizardPickKind === 'corpse') {
						finishWizardPick([i.serverId]);
						onPicked?.();
					} else {
						addToTray([i]);
					}
				}}
				searchPlaceholder={t('Search server id or name')}
			/>
			<div className="ss-loot-tray">
				<div className="ss-loot-tray-head">
					{t('Loot')}
					{lootTray.length > 0 && <span className="ss-nav-meta">{lootTray.length}</span>}
				</div>
				<div className="ss-loot-tray-items">
					{lootTray.length === 0 ? (
						<span className="ss-loot-tray-empty">
							{t('Right-click selected items above to add them here.')}
						</span>
					) : (
						lootTray.map(i => (
							<span
								key={i.serverId}
								className="ss-loot-tray-chip"
								title={i.name ? `${i.name} (#${i.serverId})` : `#${i.serverId}`}
							>
								<img src={itemUrl(i.serverId, 32)} width={32} height={32} alt="" />
							</span>
						))
					)}
				</div>
				<div className="ss-loot-tray-actions">
					{/* The same button, aimed at whoever asked for the tray: the open
					    monster ordinarily, the wizard while it is waiting for one. */}
					{wizardPickKind === 'loot' ? (
						<button
							className="ss-btn ss-btn-primary"
							disabled={lootTray.length === 0}
							onClick={() => {
								finishWizardPick(lootTray.map(i => i.serverId));
								onPicked?.();
							}}
						>
							<Plus size={14} />
							{t('Add {{count}} item to the new monster', { count: lootTray.length })}
						</button>
					) : (
						<button
							className="ss-btn ss-btn-primary"
							disabled={!doc || lootTray.length === 0}
							onClick={() => {
								addTrayToMonster();
								onPicked?.();
							}}
						>
							<Plus size={14} />
							{doc ? t('Add loot to {{monster}}', { monster: doc.name }) : t('Add loot')}
						</button>
					)}
					<button
						className="ss-btn"
						disabled={lootTray.length === 0}
						onClick={onClearTray}
						title={t('Clear the Loot section')}
					>
						<Trash2 size={14} />
						{t('Clear')}
					</button>
					{/* Presets sit beside the tray because they are the tray:
					    saving one is naming what is already collected. */}
					<button
						className="ss-btn"
						disabled={lootTray.length === 0}
						title={t('Save this tray under a name')}
						onClick={onSavePreset}
					>
						<Bookmark size={14} />
						{t('Save preset')}
					</button>
					<select
						className="ss-ed-input mx-preset-pick"
						value=""
						disabled={presets.length === 0}
						title={presets.length === 0 ? t('No presets saved yet') : t('Load a preset into the tray')}
						onChange={e => {
							const p = presets.find(x => x.name === e.target.value);
							if (p) onLoadPreset(p);
						}}
					>
						<option value="">
							{presets.length === 0 ? t('No presets') : t('Presets ({{count}})', { count: presets.length })}
						</option>
						{presets.map(p => (
							<option key={p.name} value={p.name}>
								{p.name} · {p.ids.length}
							</option>
						))}
					</select>
					{presets.length > 0 && (
						<button className="ss-btn ss-btn-ghost" title={t('Delete a preset')} onClick={onManagePresets}>
							<Trash2 size={14} />
						</button>
					)}
				</div>
			</div>
			{itemMenu && (
				<div className="ss-context-menu" style={{ left: itemMenu.x, top: itemMenu.y }} onMouseDown={e => e.stopPropagation()}>
					<button
						className="ss-menu-item"
						onClick={() => {
							onCloseItemMenu();
							addToTray(itemMenu.items);
						}}
					>
						<Package size={14} />
						{t('Add {{count}} item to Loot', { count: itemMenu.items.length })}
					</button>
					<button
						className="ss-menu-item"
						onClick={() => {
							onCloseItemMenu();
							void openUsage(itemMenu.item);
						}}
					>
						<Users size={14} />
						{t('Used by…')}
					</button>
					<button
						className="ss-menu-item"
						onClick={() => {
							onCloseItemMenu();
							toggleFavourites(itemMenu.items);
						}}
					>
						<Star size={14} />
						{itemMenu.items.every(i => favourites.has(i.serverId))
							? t('Remove {{count}} item from favourites', { count: itemMenu.items.length })
							: t('Add {{count}} item to favourites', { count: itemMenu.items.length })}
					</button>
					<button
						className="ss-menu-item"
						// Same gate as the Tools menu: the scaler rewrites files from
						// what is on disk, so an unsaved buffer would be overwritten.
						disabled={dirty}
						title={dirty ? t('Save the open monster first') : undefined}
						onClick={() => {
							onCloseItemMenu();
							onScaleDropChance(itemMenu.item.serverId);
						}}
					>
						<Percent size={14} />
						{t('Scale drop chance…')}
					</button>
					<button
						className="ss-menu-item"
						onClick={() => {
							onCloseItemMenu();
							void navigator.clipboard.writeText(String(itemMenu.item.serverId));
							showToast('ok', t('Copied {{value}}', { value: itemMenu.item.serverId }));
						}}
					>
						{t('Copy id {{id}}', { id: itemMenu.item.serverId })}
					</button>
					<button
						className="ss-menu-item"
						disabled={!itemMenu.item.name}
						onClick={() => {
							onCloseItemMenu();
							void navigator.clipboard.writeText(itemMenu.item.name);
							showToast('ok', t('Copied “{{value}}”', { value: itemMenu.item.name }));
						}}
					>
						{t('Copy name')}
					</button>
					{doc && (
						<>
							<button
								className="ss-menu-item"
								onClick={() => {
									onCloseItemMenu();
									addToMonsterLoot(itemMenu.items);
									onPicked?.();
								}}
							>
								<Plus size={14} />
								{t('Add {{count}} item to loot for {{monster}}', {
									count: itemMenu.items.length,
									monster: doc.name
								})}
							</button>
							<div className="ss-menu-sep" />
							<button
								className="ss-menu-item"
								onClick={() => {
									onCloseItemMenu();
									setAsCorpse(itemMenu.item);
									onPicked?.();
								}}
							>
								<Skull size={14} />
								{t('Set as corpse for {{monster}}', { monster: doc.name })}
							</button>
							<button
								className="ss-menu-item"
								onClick={() => {
									onCloseItemMenu();
									setAsTypeex(itemMenu.item);
									onPicked?.();
								}}
							>
								<PersonStanding size={14} />
								{t('Set as outfit (typeex) for {{monster}}', { monster: doc.name })}
							</button>
						</>
					)}
				</div>
			)}
		</>
	);
}
