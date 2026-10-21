import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import type { EditorState, EditorStore, EqualityFn } from "./storeTypes";

const EditorStoreContext = createContext<EditorStore | null>(null);

export interface EditorProviderProps extends PropsWithChildren {
  store: EditorStore;
}

export function EditorProvider({ store, children }: EditorProviderProps) {
  return <EditorStoreContext.Provider value={store}>{children}</EditorStoreContext.Provider>;
}

export function useEditorStore(): EditorStore {
  const store = useContext(EditorStoreContext);
  if (!store) {
    throw new Error("useEditorStore must be used inside an EditorProvider.");
  }
  return store;
}

export function useEditorState<T>(
  selector: (state: EditorState) => T,
  isEqual: EqualityFn<T> = Object.is,
): T {
  const store = useEditorStore();
  const cache = useRef<{
    state: EditorState;
    selector: (state: EditorState) => T;
    isEqual: EqualityFn<T>;
    value: T;
  } | null>(null);

  const getSnapshot = useCallback(() => {
    const state = store.getState();
    const cached = cache.current;

    if (cached?.state === state && cached.selector === selector && cached.isEqual === isEqual) {
      return cached.value;
    }

    const nextValue = selector(state);
    if (cached?.isEqual === isEqual && isEqual(cached.value, nextValue)) {
      cache.current = { state, selector, isEqual, value: cached.value };
      return cached.value;
    }

    cache.current = { state, selector, isEqual, value: nextValue };
    return nextValue;
  }, [isEqual, selector, store]);

  const subscribe = useCallback(
    (onStoreChange: () => void) => store.subscribe(onStoreChange),
    [store],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
