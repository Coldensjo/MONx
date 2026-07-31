import { createContext, useContext, type ReactNode } from 'react';
import { EMPTY, type CustomEffects } from '../customeffects';

/**
 * The active engine's declared effects, injected by the shell.
 *
 * A context rather than a prop because `EffectSelect` appears inside every
 * spell card and summon row, and threading the list through each of them would
 * add a parameter to a dozen components to carry a value none of them have an
 * opinion about. It defaults to empty, so a component rendered from fixtures
 * still works with no provider above it.
 */
const CustomEffectsContext = createContext<CustomEffects>(EMPTY);

export function CustomEffectsProvider({
	value,
	children
}: {
	value: CustomEffects;
	children: ReactNode;
}) {
	return <CustomEffectsContext.Provider value={value}>{children}</CustomEffectsContext.Provider>;
}

export function useCustomEffects(): CustomEffects {
	return useContext(CustomEffectsContext);
}
