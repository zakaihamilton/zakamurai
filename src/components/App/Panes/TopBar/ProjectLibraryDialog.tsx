import { useEffect, useState } from 'react';
import { listSavedProjects, type SavedProject } from '@/components/Storage/ProjectLibrary';
import Dialog from '@/components/ui/Dialog';
import styles from './ProjectLibraryDialog.module.css';

type ProjectLibraryDialogProps = {
  isOpen: boolean;
  currentProjectName: string;
  activeProjectId: string | null;
  canSave: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<SavedProject>;
  onOpen: (project: SavedProject) => Promise<void>;
  onDelete: (project: SavedProject) => Promise<void>;
};

const formatUpdatedAt = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);

export default function ProjectLibraryDialog({
  isOpen,
  currentProjectName,
  activeProjectId,
  canSave,
  onClose,
  onSave,
  onOpen,
  onDelete,
}: ProjectLibraryDialogProps) {
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState(currentProjectName || 'My App');
  const [isLoading, setLoading] = useState(false);
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedProject | null>(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setLoading(true);
    setName(currentProjectName || 'My App');
    setError(null);
    void listSavedProjects()
      .then((nextProjects) => {
        if (cancelled) return;
        setProjects(nextProjects);
        setSelectedId(activeProjectId || nextProjects[0]?.id || null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not open saved projects.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, currentProjectName, isOpen]);

  const selectedProject = projects.find((project) => project.id === selectedId) || null;

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await onSave(name);
      setProjects((current) =>
        [saved, ...current.filter((project) => project.id !== saved.id)].sort(
          (left, right) => right.updatedAt - left.updatedAt,
        ),
      );
      setSelectedId(saved.id);
      setName(saved.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this project.');
    } finally {
      setBusy(false);
    }
  };

  const handleOpen = async () => {
    if (!selectedProject) return;
    setBusy(true);
    setError(null);
    try {
      await onOpen(selectedProject);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open this project.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(deleteTarget);
      setProjects((current) => current.filter((project) => project.id !== deleteTarget.id));
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete this project.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog
        isOpen={isOpen}
        title="Saved projects"
        className={styles.dialog}
        onConfirm={onClose}
        onCancel={onClose}
        footer={
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onClose}
              disabled={isBusy}
            >
              Close
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void handleSave()}
              disabled={isBusy || isLoading || !canSave || !name.trim()}
            >
              {isBusy ? 'Working…' : 'Save current'}
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleOpen()}
              disabled={isBusy || isLoading || !canSave || !selectedProject}
            >
              Open selected
            </button>
          </div>
        }
      >
        <div className={styles.content}>
          <p className={styles.description}>
            Save named project copies in this browser, then reopen them later. Nothing is uploaded.
            Opening a saved project replaces the current workspace, so save a copy first if you need
            it. Saving updates the active entry when one is open; otherwise, it creates a new entry.
          </p>
          <label className={styles.nameLabel} htmlFor="project-library-name">
            Current project name
          </label>
          <input
            id="project-library-name"
            className={styles.nameInput}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            disabled={isBusy || !canSave}
          />
          {!canSave && (
            <p className={styles.localFolderNote}>
              Disconnect the opened local folder to open or save browser project copies.
            </p>
          )}
          <div className={styles.listHeading}>
            <h4>On this device</h4>
            <span>{projects.length}</span>
          </div>
          {isLoading ? (
            <div className={styles.emptyState} role="status">
              <strong>Loading saved projects…</strong>
            </div>
          ) : projects.length ? (
            <ul className={styles.projectList} aria-label="Saved projects">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className={`${styles.projectRow} ${selectedId === project.id ? styles.selected : ''}`}
                    onClick={() => setSelectedId(project.id)}
                    aria-pressed={selectedId === project.id}
                  >
                    <span className={styles.projectDetails}>
                      <strong>{project.name}</strong>
                      <span>{formatUpdatedAt(project.updatedAt)}</span>
                    </span>
                    {activeProjectId === project.id && (
                      <span className={styles.currentBadge}>Active</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={() => setDeleteTarget(project)}
                    aria-label={`Delete ${project.name}`}
                    disabled={isBusy}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.emptyState}>
              <strong>No saved projects yet</strong>
              <span>Save the current project to keep a named copy in this browser.</span>
            </div>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
      </Dialog>
      <Dialog
        isOpen={Boolean(deleteTarget)}
        title="Delete saved project?"
        message={`“${deleteTarget?.name || ''}” will be removed from this browser.`}
        confirmText="Delete project"
        cancelText="Keep project"
        type="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
