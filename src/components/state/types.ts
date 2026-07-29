import type { FC, ReactNode } from 'react';

/** Mutable draft passed to state store update callbacks. */
export type Draft<T> = {
  -readonly [K in keyof T]: T[K] extends object ? Draft<T[K]> : T[K];
};

export type NodeListener = (node: StateNode, propId: unknown, value: unknown) => void;

export interface StateNode {
  id: string;
  parent: StateNode | null;
  items: Map<unknown, unknown>;
  listeners: Set<NodeListener>;
}

export type StateMonitorCallback = (keys: string[] | null) => void;

export interface StateMonitorEntry {
  key: string | null;
  cb: StateMonitorCallback;
  id?: string;
  counter: number;
}

export interface StateStoreInternals<T extends object> {
  __monitor: (key: string | null, cb: StateMonitorCallback, id?: string) => void;
  __unmonitor: (key: string | null, cb: StateMonitorCallback, id?: string) => void;
  readonly __monitored: StateMonitorEntry[];
  readonly __unique: string;
  readonly __id: string | undefined;
  readonly __object: T;
  readonly __counter: number;
  readonly __string: string;
  __node: StateNode | undefined;
}

/** Callable proxy store returned by createObject / createState hooks. */
export type StateStore<T extends object> = StateStoreInternals<T> &
  T & {
    (draft: (draft: Draft<T>) => void): void;
  };

export type StateSelectorKey<T extends object> = keyof T & string;

export type StateSelectorPredicate = (key: string) => boolean;

export type StateSelectorMap<T extends object> = Partial<Record<keyof T, unknown>>;

export type StateSelector<T extends object> =
  | StateSelectorKey<T>
  | StateSelectorKey<T>[]
  | StateSelectorMap<T>
  | StateSelectorPredicate
  | null
  | undefined;

export interface StateScopeProps<T extends object> {
  children?: ReactNode | ((state: StateStore<T> | undefined) => ReactNode);
}

export interface StateScope<T extends object> extends FC<StateScopeProps<T> & Partial<T>> {
  useState: (
    selector?: StateSelector<T>,
    initial?: Partial<T>,
    id?: string,
  ) => StateStore<T> | undefined;
  useFutureState: (selector?: StateSelector<T>, id?: string) => StateStore<T> | undefined;
  usePassiveState: () => StateStore<T> | undefined;
  displayName: string;
}
