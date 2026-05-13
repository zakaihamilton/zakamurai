export const DEFAULT_FILES = [
  {
    name: 'src',
    type: 'folder',
    children: [
      {
        name: 'components',
        type: 'folder',
        children: [
          { name: 'AnimatedCard.jsx', type: 'file' },
          { name: 'AnimatedCard.module.css', type: 'file' },
          { name: 'Icons.jsx', type: 'file' },
        ],
      },
      { name: 'App.jsx', type: 'file' },
      { name: 'App.module.css', type: 'file' },
      { name: 'main.jsx', type: 'file' },
    ],
  },
  { name: 'package.json', type: 'file' },
  { name: 'vite.config.js', type: 'file' },
];

export const DEFAULT_CONTENTS = {
  'src/main.jsx':
    'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\n\nReactDOM.createRoot(document.getElementById("root")).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);',

  'src/App.jsx':
    'import AnimatedCard from "./components/AnimatedCard";\nimport styles from "./App.module.css";\n\nexport default function App() {\n  return (\n    <div className={styles.container}>\n      <AnimatedCard />\n    </div>\n  );\n}',

  'src/App.module.css':
    ':global(body) {\n  margin: 0;\n  padding: 0;\n}\n\n.container {\n  min-height: 100vh;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  background-color: #050505;\n  background-image: radial-gradient(circle at 50% 0%, #1f143a 0%, #050505 60%);\n  font-family: system-ui, sans-serif;\n  overflow: hidden;\n  color: #ffffff;\n}',

  'src/components/AnimatedCard.jsx':
    'import styles from "./AnimatedCard.module.css";\nimport { SparklesIcon, CheckIcon } from "./Icons";\n\nexport default function AnimatedCard() {\n  return (\n    <>\n      <div className={styles.backgroundGlow} />\n      <div className={styles.card}>\n        <div className={styles.iconWrapper}>\n          <SparklesIcon />\n        </div>\n        <span className={styles.badge}>New Release</span>\n        <h2 className={styles.title}>Next-Gen Interface</h2>\n        <p className={styles.description}>\n          Elevate your application with our beautifully crafted, highly animated\n          components that keep your users fully engaged.\n        </p>\n        <ul className={styles.featuresList}>\n          <li className={styles.featureItem}><CheckIcon /> CSS Module Support</li>\n          <li className={styles.featureItem}><CheckIcon /> Hardware Accelerated</li>\n          <li className={styles.featureItem}><CheckIcon /> Glassmorphism UI</li>\n        </ul>\n        <div className={styles.buttonGroup}>\n          <button className={styles.primaryButton}>\n            <span className={styles.shimmer}></span>\n            Get Started\n          </button>\n          <button className={styles.secondaryButton}>View Docs</button>\n        </div>\n      </div>\n    </>\n  );\n}',

  'src/components/AnimatedCard.module.css':
    '.backgroundGlow {\n  position: absolute;\n  width: 600px;\n  height: 600px;\n  background: radial-gradient(circle, rgba(138, 43, 226, 0.15) 0%, rgba(0, 0, 0, 0) 70%);\n  top: 50%;\n  left: 50%;\n  transform: translate(-50%, -50%);\n  z-index: 0;\n  animation: pulse 8s ease-in-out infinite alternate;\n}\n.card {\n  position: relative;\n  z-index: 1;\n  width: 100%;\n  max-width: 420px;\n  background: rgba(255, 255, 255, 0.03);\n  backdrop-filter: blur(16px);\n  border: 1px solid rgba(255, 255, 255, 0.08);\n  border-radius: 24px;\n  padding: 2.5rem;\n  animation: slideUp 0.8s ease-out forwards;\n}\n.iconWrapper {\n  width: 56px;\n  height: 56px;\n  background: linear-gradient(135deg, rgba(138, 43, 226, 0.2), rgba(75, 0, 130, 0.4));\n  border-radius: 16px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  margin-bottom: 1.5rem;\n  animation: float 6s ease-in-out infinite;\n}\n.badge {\n  padding: 0.25rem 0.75rem;\n  background: rgba(255, 255, 255, 0.05);\n  border-radius: 999px;\n  font-size: 0.75rem;\n  color: #a78bfa;\n}\n.title {\n  font-size: 1.75rem;\n  background: linear-gradient(to right, #fff, #a8a2bc);\n  -webkit-background-clip: text;\n  -webkit-text-fill-color: transparent;\n}\n.description {\n  color: #9ca3af;\n  line-height: 1.6;\n}\n.featuresList {\n  list-style: none;\n  padding: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 0.75rem;\n}\n.featureItem {\n  display: flex;\n  align-items: center;\n  gap: 0.5rem;\n  color: #e5e7eb;\n}\n.buttonGroup {\n  display: flex;\n  gap: 1rem;\n  margin-top: 2rem;\n}\n.primaryButton {\n  flex: 1;\n  position: relative;\n  padding: 0.75rem;\n  background: linear-gradient(135deg, #7c3aed, #4c1d95);\n  border: none;\n  border-radius: 12px;\n  color: white;\n  overflow: hidden;\n  cursor: pointer;\n}\n.secondaryButton {\n  flex: 1;\n  padding: 0.75rem;\n  background: rgba(255,255,255,0.05);\n  border: 1px solid rgba(255,255,255,0.1);\n  border-radius: 12px;\n  color: white;\n  cursor: pointer;\n}\n.shimmer {\n  position: absolute;\n  top: 0;\n  left: -100%;\n  width: 50%;\n  height: 100%;\n  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);\n  animation: shimmer 3s infinite;\n}\n@keyframes pulse { from { opacity: 0.5; } to { opacity: 1; } }\n@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }\n@keyframes shimmer { 0% { left: -100%; } 100% { left: 200%; } }\n@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }',

  'src/components/Icons.jsx':
    'export const SparklesIcon = () => (\n  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d8b4fe" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">\n    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>\n    <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>\n  </svg>\n);\n\nexport const CheckIcon = () => (\n  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">\n    <polyline points="20 6 9 17 4 12"/>\n  </svg>\n);',

  'package.json':
    '{\n  "name": "animated-vite-app",\n  "private": true,\n  "version": "0.1.0",\n  "type": "module",\n  "scripts": {\n    "dev": "vite",\n    "build": "vite build",\n    "preview": "vite preview"\n  },\n  "dependencies": {\n    "react": "^18.2.0",\n    "react-dom": "^18.2.0"\n  },\n  "devDependencies": {\n    "@vitejs/plugin-react": "^4.0.0",\n    "vite": "^4.3.0"\n  }\n}',

  'vite.config.js':
    'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  plugins: [react()],\n});',
};
export const SCRATCH_FILES = [
  {
    name: 'src',
    type: 'folder',
    children: [
      { name: 'App.jsx', type: 'file' },
      { name: 'main.jsx', type: 'file' },
    ],
  },
  { name: 'package.json', type: 'file' },
  { name: 'vite.config.js', type: 'file' },
];

export const SCRATCH_CONTENTS = {
  'src/main.jsx':
    'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\n\nReactDOM.createRoot(document.getElementById("root")).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);',

  'src/App.jsx':
    'export default function App() {\n  return (\n    <div>\n      <h1>New Project</h1>\n      <p>Start coding here...</p>\n    </div>\n  );\n}',

  'package.json':
    '{\n  "name": "new-project",\n  "private": true,\n  "version": "0.1.0",\n  "type": "module",\n  "scripts": {\n    "dev": "vite",\n    "build": "vite build",\n    "preview": "vite preview"\n  },\n  "dependencies": {\n    "react": "^18.2.0",\n    "react-dom": "^18.2.0"\n  },\n  "devDependencies": {\n    "@vitejs/plugin-react": "^4.0.0",\n    "vite": "^4.3.0"\n  }\n}',

  'vite.config.js':
    'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  plugins: [react()],\n});',
};
