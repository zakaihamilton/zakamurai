export const TODO_APP_FALLBACK_FILES = {
  'src/App.module.css': `:root {
  --paper: #f7f0e3;
  --paper-deep: #eadcc4;
  --ink: #21332d;
  --muted-ink: #6c756d;
  --accent: #cf5d3b;
  --accent-dark: #a94227;
  --line: rgb(33 51 45 / 16%);
  --shadow: 0 24px 60px rgb(55 42 22 / 16%);
}

* {
  box-sizing: border-box;
}

.app {
  min-height: 100vh;
  padding: clamp(1.5rem, 5vw, 4.5rem) 1rem;
  color: var(--ink);
  font-family: "Trebuchet MS", "Segoe UI", sans-serif;
  background:
    radial-gradient(circle at top right, rgb(207 93 59 / 18%), transparent 32rem),
    repeating-linear-gradient(0deg, transparent 0 31px, rgb(33 51 45 / 4%) 32px),
    var(--paper);
}

.planner {
  width: min(100%, 43rem);
  margin: 0 auto;
  padding: clamp(1.5rem, 5vw, 3.25rem);
  background: rgb(255 252 246 / 90%);
  border: 1px solid var(--line);
  border-radius: 1.5rem;
  box-shadow: var(--shadow);
}

.eyebrow {
  margin: 0 0 0.75rem;
  color: var(--accent-dark);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.title {
  margin: 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(2.5rem, 8vw, 4.75rem);
  font-weight: 500;
  letter-spacing: -0.07em;
  line-height: 0.94;
}

.subtitle {
  max-width: 31rem;
  margin: 1rem 0 2rem;
  color: var(--muted-ink);
  font-size: 1rem;
  line-height: 1.55;
}

.form {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.75rem;
}

.input {
  width: 100%;
  min-width: 0;
  padding: 0.9rem 1rem;
  color: var(--ink);
  font: inherit;
  background: #fffdf8;
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  outline: none;
}

.input:focus-visible,
.addButton:focus-visible,
.checkbox:focus-visible,
.deleteButton:focus-visible {
  outline: 3px solid rgb(207 93 59 / 35%);
  outline-offset: 3px;
}

.addButton {
  flex: 0 0 auto;
  padding: 0.9rem 1.1rem;
  color: #fffaf2;
  font: inherit;
  font-weight: 700;
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 0.75rem;
  cursor: pointer;
  transition: background 160ms ease, transform 160ms ease;
}

.addButton:hover {
  background: var(--accent-dark);
  transform: translateY(-2px);
}

.list {
  display: grid;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.task {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.8rem;
  align-items: center;
  padding: 1rem 0.25rem;
  border-bottom: 1px solid var(--line);
}

.task:last-child {
  border-bottom: 0;
}

.completed .taskText {
  color: var(--muted-ink);
  text-decoration: line-through;
  text-decoration-color: var(--accent);
  text-decoration-thickness: 2px;
}

.checkbox {
  width: 1.2rem;
  height: 1.2rem;
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
}

.taskText {
  min-width: 0;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.deleteButton {
  padding: 0.35rem;
  color: var(--muted-ink);
  font: inherit;
  font-size: 0.82rem;
  background: transparent;
  border: 0;
  border-radius: 0.4rem;
  cursor: pointer;
}

.deleteButton:hover {
  color: var(--accent-dark);
  background: rgb(207 93 59 / 10%);
}

.empty {
  padding: 2.5rem 1rem;
  color: var(--muted-ink);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.2rem;
  text-align: center;
}

@media (width <= 32rem) {
  .planner {
    padding: 1.5rem;
    border-radius: 1rem;
  }

  .form {
    flex-direction: column;
  }

  .addButton {
    width: 100%;
  }
}
`,
  'src/App.jsx': `import { useState } from "react";
import styles from "./App.module.css";

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [draft, setDraft] = useState("");

  function addTask(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setTasks((current) => [...current, { id: Date.now(), text, completed: false }]);
    setDraft("");
  }

  function toggleTask(id) {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, completed: !task.completed } : task)),
    );
  }

  function deleteTask(id) {
    setTasks((current) => current.filter((task) => task.id !== id));
  }

  return (
    <main className={styles.app}>
      <section className={styles.planner} aria-labelledby="todo-title">
        <p className={styles.eyebrow}>The daily edit</p>
        <h1 id="todo-title" className={styles.title}>Make room for what matters.</h1>
        <p className={styles.subtitle}>A quiet place to collect the next right things.</p>
        <form className={styles.form} onSubmit={addTask}>
          <input
            className={styles.input}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a task"
            aria-label="New task"
          />
          <button className={styles.addButton} type="submit">Add task</button>
        </form>
        {tasks.length === 0 ? (
          <p className={styles.empty}>Your list is clear. What deserves your attention?</p>
        ) : (
          <ul className={styles.list} aria-label="Tasks">
            {tasks.map((task) => (
              <li
                key={task.id}
                className={styles.task + (task.completed ? " " + styles.completed : "")}
              >
                <input
                  className={styles.checkbox}
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => toggleTask(task.id)}
                  aria-label={"Mark " + task.text + " as " + (task.completed ? "incomplete" : "complete")}
                />
                <span className={styles.taskText}>{task.text}</span>
                <button className={styles.deleteButton} type="button" onClick={() => deleteTask(task.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
`,
} as const;
