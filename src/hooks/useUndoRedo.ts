import { useCallback, useRef, type MutableRefObject } from 'react';
import type { MonsterDoc } from '../monster';
import { emptyHistory, recordEdit, redo as redoStep, undo as undoStep, type History, type Step } from '../history';

/**
 * Undo/redo for the monster on screen.
 *
 * The rules are `history.ts` and are tested there. What is here is the part
 * that has to be a hook: a ref holding the stacks across renders, and the
 * commit that puts a restored document back on screen.
 *
 * `commit` is passed in rather than owned. Restoring a document means writing
 * it into the tab buffer, marking the file dirty and re-linting it — all of
 * which belong to the editor tabs, not to the history. Taking it as a parameter
 * is what keeps this hook about the stacks alone.
 */
export interface UndoRedo {
	/** The document as of this render, for callers that need it inside a
	 *  callback or effect without taking it as a dependency. */
	docRef: MutableRefObject<MonsterDoc | null>;
	/** Replaces the document, recording the one it replaced. */
	editDoc: (next: MonsterDoc) => void;
	undoEdit: () => void;
	redoEdit: () => void;
	/** Throws the history away. A fresh buffer starts a fresh history — undo
	 *  must never cross files. */
	resetHistory: () => void;
	/** Read during render, for the Undo/Redo commands' `enabled`. */
	canUndo: () => boolean;
	canRedo: () => boolean;
}

export function useUndoRedo(doc: MonsterDoc | null, commit: (next: MonsterDoc) => void): UndoRedo {
	const docRef = useRef<MonsterDoc | null>(doc);
	docRef.current = doc;
	const historyRef = useRef<History<MonsterDoc>>(emptyHistory());

	const editDoc = useCallback(
		(next: MonsterDoc) => {
			if (docRef.current) historyRef.current = recordEdit(historyRef.current, docRef.current);
			commit(next);
		},
		[commit]
	);

	const applyHistory = useCallback(
		(step: (h: History<MonsterDoc>, current: MonsterDoc) => Step<MonsterDoc> | null) => {
			const current = docRef.current;
			if (!current) return;
			const taken = step(historyRef.current, current);
			if (!taken) return;
			historyRef.current = taken.history;
			commit(taken.doc);
		},
		[commit]
	);

	return {
		docRef,
		editDoc,
		undoEdit: useCallback(() => applyHistory(undoStep), [applyHistory]),
		redoEdit: useCallback(() => applyHistory(redoStep), [applyHistory]),
		resetHistory: useCallback(() => {
			historyRef.current = emptyHistory();
		}, []),
		canUndo: () => historyRef.current.past.length > 0,
		canRedo: () => historyRef.current.future.length > 0
	};
}
