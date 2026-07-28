import { createContext, useContext, type ReactNode } from 'react';

/**
 * Renders one client thing to a URL. The editor never owns the .spr/.dat
 * handles `/thing.png` needs, so the shell injects this; without it the
 * controls fall back to plain labels rather than broken images.
 *
 * `id` is the raw enum value — `CONST_ME_FIREAREA` passes 7 — so the mapping
 * from effect id to dat entry stays in one place outside the editor.
 */
export type PreviewUrl = (kind: 'effect' | 'missile' | 'outfit' | 'item', id: number) => string | null;

const PreviewContext = createContext<PreviewUrl | null>(null);

export function PreviewProvider({ value, children }: { value: PreviewUrl | null; children: ReactNode }) {
	return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function usePreviewUrl(): PreviewUrl | null {
	return useContext(PreviewContext);
}
