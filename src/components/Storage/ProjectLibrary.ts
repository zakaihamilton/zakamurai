import type { PendingDeletionEntry } from '@/components/App/Views/EditorArea/types';
import type { ChangeSetStateShape, PendingDiff } from '@/types/domain-types';
import { getStorage } from './SettingsKeys';

const DATABASE_NAME = 'zakamurai-project-library';
const DATABASE_VERSION = 1;
const PROJECTS_STORE = 'projects';
// Keep this outside SETTINGS_KEYS so workspace resets preserve saved project copies.
const LOCAL_STORAGE_KEY = 'zakamurai_project_library';

export type SavedProject = {
  id: string;
  name: string;
  templateId: string;
  updatedAt: number;
  contents: Record<string, string>;
  pendingDiffs: Record<string, PendingDiff>;
  pendingDeletions: Record<string, PendingDeletionEntry | boolean>;
  changeSets: ChangeSetStateShape;
};

export type SaveProjectInput = Omit<SavedProject, 'id' | 'updatedAt'> & {
  id?: string | null;
};

let databasePromise: Promise<IDBDatabase> | null = null;

function hasIndexedDB(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && typeof indexedDB.open === 'function';
  } catch {
    return false;
  }
}

function getDatabase(): Promise<IDBDatabase> {
  if (!hasIndexedDB()) {
    return Promise.reject(new Error('Project library storage is unavailable in this browser.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECTS_STORE)) {
        database.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error('Could not open the project library.'));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error('Close another Zakamurai tab to open the project library.'));
    };
  });

  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Project library request failed.'));
  });
}

function transactionResult(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error('Project library save failed.'));
    transaction.onabort = () =>
      reject(transaction.error || new Error('Project library save was cancelled.'));
  });
}

const makeId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `project-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function isSavedProject(value: unknown): value is SavedProject {
  if (!value || typeof value !== 'object') return false;
  const project = value as Partial<SavedProject>;
  return (
    typeof project.id === 'string' &&
    typeof project.name === 'string' &&
    typeof project.templateId === 'string' &&
    typeof project.updatedAt === 'number' &&
    Boolean(project.contents) &&
    typeof project.contents === 'object' &&
    !Array.isArray(project.contents)
  );
}

function sortSavedProjects(values: unknown): SavedProject[] {
  if (!Array.isArray(values)) return [];
  return values.filter(isSavedProject).sort((left, right) => right.updatedAt - left.updatedAt);
}

function readFallbackProjects(): SavedProject[] {
  const storage = getStorage();
  if (!storage) throw new Error('Saved project storage is unavailable in this browser.');
  let stored: string | null;
  try {
    stored = storage.getItem(LOCAL_STORAGE_KEY);
  } catch {
    throw new Error('Saved project storage is unavailable in this browser.');
  }
  if (!stored) return [];
  try {
    return sortSavedProjects(JSON.parse(stored));
  } catch {
    throw new Error('Saved project data could not be read from this browser.');
  }
}

function writeFallbackProjects(projects: SavedProject[]): void {
  const storage = getStorage();
  if (!storage) throw new Error('Saved project storage is unavailable in this browser.');
  try {
    storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(projects));
  } catch {
    throw new Error(
      'Browser storage is unavailable or full, so saved projects could not be updated.',
    );
  }
}

export async function listSavedProjects(): Promise<SavedProject[]> {
  if (!hasIndexedDB()) return readFallbackProjects();
  const database = await getDatabase();
  const transaction = database.transaction(PROJECTS_STORE, 'readonly');
  const projects = await requestResult(transaction.objectStore(PROJECTS_STORE).getAll());
  return sortSavedProjects(projects);
}

export async function saveProject(input: SaveProjectInput): Promise<SavedProject> {
  const record: SavedProject = {
    ...input,
    id: input.id || makeId(),
    name: input.name.trim() || 'Untitled project',
    updatedAt: Date.now(),
    contents: Object.fromEntries(
      Object.entries(input.contents).map(([path, content]) => [path, String(content)]),
    ),
    pendingDiffs: cloneJson(input.pendingDiffs),
    pendingDeletions: cloneJson(input.pendingDeletions),
    changeSets: cloneJson(input.changeSets),
  };

  if (!hasIndexedDB()) {
    const projects = readFallbackProjects();
    writeFallbackProjects([record, ...projects.filter((project) => project.id !== record.id)]);
    return record;
  }

  const database = await getDatabase();
  const transaction = database.transaction(PROJECTS_STORE, 'readwrite');
  transaction.objectStore(PROJECTS_STORE).put(record);
  await transactionResult(transaction);
  return record;
}

export async function deleteSavedProject(id: string): Promise<void> {
  if (!hasIndexedDB()) {
    writeFallbackProjects(readFallbackProjects().filter((project) => project.id !== id));
    return;
  }
  const database = await getDatabase();
  const transaction = database.transaction(PROJECTS_STORE, 'readwrite');
  transaction.objectStore(PROJECTS_STORE).delete(id);
  await transactionResult(transaction);
}
