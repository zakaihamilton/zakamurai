import { type Mock, vi } from 'vitest';
import { bindWebLLMStore } from '../WebLLMState';
import type { AskWebLLM } from '../types';

export const PLAYABLE_INTERACTIVE_APP = `import { useState } from "react";
export default function App() {
  const [items, setItems] = useState(["One", "Two", "Three"]);
  const [draft, setDraft] = useState("");
  const addItem = () => {
    if (!draft.trim()) return;
    setItems([...items, draft.trim()]);
    setDraft("");
  };
  return (
    <main>
      <h1>Notes</h1>
      <input value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button type="button" onClick={addItem}>
        Add
      </button>
      <div>
        {items.map((item) => (
          <button key={item} type="button" onClick={() => setItems(items.filter((value) => value !== item))}>
            {item}
          </button>
        ))}
      </div>
    </main>
  );
}
`;

export const TIC_TAC_TOE_APP = `import { useState } from "react";
import styles from "./App.module.css";

const WINNING_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export default function App() {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [xIsNext, setXIsNext] = useState(true);
  const winner = WINNING_LINES.map(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c] ? board[a] : null).find(Boolean);
  const draw = !winner && board.every(Boolean);
  const play = (index) => {
    if (board[index] || winner) return;
    const nextBoard = [...board];
    nextBoard[index] = xIsNext ? "X" : "O";
    setBoard(nextBoard);
    setXIsNext(!xIsNext);
  };
  const reset = () => {
    setBoard(Array(9).fill(null));
    setXIsNext(true);
  };
  return (
    <main className={styles.app}>
      <h1 className={styles.title}>Tic Tac Toe</h1>
      <p className={styles.status}>{winner ? \`Winner: \${winner}\` : draw ? "Draw game" : \`\${xIsNext ? "X" : "O"}'s turn\`}</p>
      <div className={styles.board} role="grid">
        {board.map((cell, index) => <button className={styles.cell} key={index} type="button" onClick={() => play(index)}>{cell}</button>)}
      </div>
      <button className={styles.reset} type="button" onClick={reset}>Reset game</button>
    </main>
  );
}
`;

export const SIMPLE_TODO_APP = `import React, { useState } from 'react';
import styles from './App.module.css';

export default function App() {
  const [todos, setTodos] = useState([{ id: 1, text: 'First task', completed: false }]);
  const [input, setInput] = useState('');

  const handleAdd = () => {
    if (!input.trim()) return;
    setTodos([...todos, { id: Date.now(), text: input.trim(), completed: false }]);
    setInput('');
  };

  return (
    <main className={styles.app}>
      <h1>Todo App</h1>
      <div className={styles.control}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a new task..."
        />
        <button onClick={handleAdd}>Add Task</button>
      </div>
      <ul className={styles.list}>
        {todos.map((todo) => (
          <li key={todo.id}>{todo.text}</li>
        ))}
      </ul>
    </main>
  );
}`;

export async function resetActionLoopTestCase(): Promise<Mock<AskWebLLM>> {
  vi.clearAllMocks();
  vi.resetAllMocks();
  bindWebLLMStore(null);
  const { askWebLLM } = (await import('../WebLLMAPI')) as unknown as {
    askWebLLM: Mock<AskWebLLM>;
  };
  return askWebLLM;
}

export function teardownActionLoopTestCase() {
  bindWebLLMStore(null);
  vi.useRealTimers();
}
