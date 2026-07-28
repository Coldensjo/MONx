import { useEffect, useRef, useState } from 'react';

export interface MenuItem {
	label: string;
	onSelect: () => void;
	/** Shown right-aligned, e.g. "Ctrl+S". Display only — the binding lives with the action. */
	shortcut?: string;
	disabled?: boolean;
	/** Draws a rule above this item. */
	separated?: boolean;
}

export interface Menu {
	label: string;
	items: MenuItem[];
}

/**
 * The strip under the titlebar. Desktop-menu behaviour: click to open, then
 * hovering another title switches to it without a second click; click anywhere
 * else, or Escape, closes.
 */
export default function Menubar({ menus }: { menus: Menu[] }) {
	const [open, setOpen] = useState<string | null>(null);
	const root = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const away = (e: MouseEvent) => {
			if (!root.current?.contains(e.target as Node)) setOpen(null);
		};
		const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
		window.addEventListener('mousedown', away);
		window.addEventListener('keydown', esc);
		return () => {
			window.removeEventListener('mousedown', away);
			window.removeEventListener('keydown', esc);
		};
	}, [open]);

	return (
		<div className="mx-menubar" ref={root}>
			{menus.map(menu => (
				<div className="mx-menu" key={menu.label}>
					<button
						type="button"
						className={`mx-menu-title ${open === menu.label ? 'mx-menu-title-open' : ''}`}
						onClick={() => setOpen(o => (o === menu.label ? null : menu.label))}
						onMouseEnter={() => setOpen(o => (o === null ? o : menu.label))}
					>
						{menu.label}
					</button>
					{open === menu.label && (
						<div className="mx-menu-pop">
							{menu.items.map(item => (
								<button
									type="button"
									key={item.label}
									className={`mx-menu-item ${item.separated ? 'mx-menu-item-sep' : ''}`}
									disabled={item.disabled}
									onClick={() => {
										setOpen(null);
										item.onSelect();
									}}
								>
									<span>{item.label}</span>
									{item.shortcut && <span className="mx-menu-shortcut">{item.shortcut}</span>}
								</button>
							))}
						</div>
					)}
				</div>
			))}
		</div>
	);
}
