import { Icons } from '@/components/ui/Icons';
import Tooltip from '@/components/ui/Tooltip';
import { useEffect, useRef, useState } from 'react';
import styles from './ViewSwitcher.module.css';

type ViewSwitcherProps = {
  activeView: 'Code' | 'Logs' | 'Preview';
  canOpenCode: boolean;
  onOpenCode: () => void;
  onOpenLog: () => void;
  onOpenPreview: () => void;
};

const viewOptions = [
  { label: 'Code', icon: Icons.Code },
  { label: 'Logs', icon: Icons.Terminal },
  { label: 'Preview', icon: Icons.Globe },
] as const;

const viewIcons = {
  Code: Icons.Code,
  Logs: Icons.Terminal,
  Preview: Icons.Globe,
} as const;

export default function ViewSwitcher({
  activeView,
  canOpenCode,
  onOpenCode,
  onOpenLog,
  onOpenPreview,
}: ViewSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const ActiveIcon = viewIcons[activeView];

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!switcherRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (view: (typeof viewOptions)[number]['label']) => {
    if (view === 'Code') {
      onOpenCode();
    } else if (view === 'Logs') {
      onOpenLog();
    } else {
      onOpenPreview();
    }
    setIsOpen(false);
  };

  return (
    <div ref={switcherRef} className={styles.switcher}>
      <Tooltip content="Switch view">
        <button
          type="button"
          className={`${styles.trigger} ${isOpen ? styles.triggerActive : ''}`}
          onClick={() => setIsOpen((open) => !open)}
          aria-label={`Switch view, current ${activeView}`}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls="mobile-view-switcher-menu"
          data-testid="mobile-view-switcher"
        >
          <ActiveIcon size={18} />
          <Icons.ChevronDown size={12} />
        </button>
      </Tooltip>
      {isOpen && (
        <div id="mobile-view-switcher-menu" className={styles.menu} role="menu">
          {viewOptions.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              className={`${styles.option} ${label === activeView ? styles.optionActive : ''}`}
              onClick={() => handleSelect(label)}
              disabled={label === 'Code' && !canOpenCode}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
