# Project Architecture & State Management Rules

**CRITICAL INSTRUCTION FOR AI ASSISTANTS:** This project DOES NOT use standard React global state management. Do NOT use Redux, Zustand, Recoil, or React's standard Context API + `useState` for sharing state between components. 

We use a bespoke Hierarchical Context + Proxy architecture optimized for high-frequency, granular mutations. You must adhere to the following rules when generating or modifying React components.

## 1. Core Concepts
* **Node (`src/Core/Base/Node.js`):** Creates a spatial hierarchy mirroring the DOM. State exists at specific levels of the tree, not globally.
* **Object (`src/Core/Base/Object.js`):** A Proxy wrapper that intercepts mutations, performs zero-allocation diffing, and surgically updates subscribers without top-down React re-renders.
* **State (`src/Core/Base/State.js`):** The hook interface for subscribing to Proxy Objects.

## 2. Reading State
Do not use standard selectors. Use the provided hooks.

**For state guaranteed to exist in the current or ancestor nodes:**
```javascript
import { State } from 'src/Core/Base/State'; 

function MyComponent() {
  // Pass a string key to get a specific primitive
  const value = State.useState('myKey'); 
  
  // Or pass no selector to get the whole proxy object
  const store = State.useState();
  
  return <div>{value}</div>;
}
```

**For state that may be loaded lazily or asynchronously higher in the tree:**
```javascript
function MyDeepComponent() {
  // Listens up the hierarchy until the state is hydrated
  const futureValue = State.useFutureState('myKey');
}
```

## 3. Mutating State (STRICT RULES)
You must NEVER return a cloned object (e.g., `return { ...state, key: new_value }`). You must NEVER use a traditional setter tuple.

State is mutated by passing a callback function to the store proxy. This callback receives a mutable `draft`. The underlying Proxy will calculate the diff and trigger micro-task updates.

### Shallow Mutation Only
The `draft` is a shallow clone. You **must not** mutate nested objects directly. If a property is an object or array, you must replace it entirely at the top level of the draft.

**Correct Mutation Patterns:**
```javascript
function InteractiveComponent() {
  const store = State.useState();

  const handleUpdate = () => {
    store((draft) => {
      // Correct: Mutating top-level primitives
      draft.isActive = true; 
      
      // Correct: Shallow replacement of a nested object
      draft.position = { ...draft.position, x: 100 }; 
      
      // Correct: Shallow replacement of an array
      draft.items = [...draft.items, newItem]; 
    });
  };
}
```

**FORBIDDEN Patterns:**
* ❌ `draft.position.x = 100;` (Fails proxy diffing)
* ❌ `draft.items.push(newItem);` (Fails proxy diffing)
* ❌ `const [val, setVal] = useState(...)` (For shared state)
* ❌ `store.update({ position: 100 })`
* ❌ `setStore(prev => ({ ...prev, isActive: true }))`

## 4. Component Generation Strategy
When generating new UI elements:
1. Default to standard, "dumb" presentation components that receive data via props.
2. If the component needs to read/write shared state, create a "Container" component that uses `State.useState()` or `State.useFutureState()` and passes the extracted primitives down as props to the presentation layer.
3. Do not attempt to modify `Node.js`, `Object.js`, or `State.js` unless explicitly instructed.
