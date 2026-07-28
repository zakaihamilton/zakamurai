import { useEffect, useState } from 'react';

const COMMAND_NAV_DELAY_MS = 1000;
let commandKeyPressed = false;

/** Delays command-navigation highlighting to avoid accidental link affordances while typing shortcuts. */
export default function useEditorNavigationMode() {
  const [isCommandPressed, setIsCommandPressed] = useState(() => commandKeyPressed);

  useEffect(() => {
    let delayTimer = null;
    const setCommandHighlightEnabled = (nextValue) => {
      commandKeyPressed = nextValue;
      setIsCommandPressed(nextValue);
    };
    const clearDelayTimer = () => {
      if (delayTimer !== null) {
        clearTimeout(delayTimer);
        delayTimer = null;
      }
    };
    const scheduleCommandHighlight = () => {
      if (commandKeyPressed || delayTimer !== null) return;
      delayTimer = setTimeout(() => {
        delayTimer = null;
        setCommandHighlightEnabled(true);
      }, COMMAND_NAV_DELAY_MS);
    };
    const disableCommandHighlight = () => {
      clearDelayTimer();
      setCommandHighlightEnabled(false);
    };
    const handleKeyDown = (event) => event.key === 'Meta' && scheduleCommandHighlight();
    const handleKeyUp = (event) => event.key === 'Meta' && disableCommandHighlight();
    const handleMouseModifier = (event) =>
      event.metaKey ? scheduleCommandHighlight() : disableCommandHighlight();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseModifier);
    window.addEventListener('mousemove', handleMouseModifier);
    window.addEventListener('blur', disableCommandHighlight);
    return () => {
      clearDelayTimer();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseModifier);
      window.removeEventListener('mousemove', handleMouseModifier);
      window.removeEventListener('blur', disableCommandHighlight);
    };
  }, []);

  return isCommandPressed;
}
