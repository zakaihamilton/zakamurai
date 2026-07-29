import { describe, expect, it } from 'vitest';
import TopBar, {
  ActionButtons,
  Breadcrumb,
  HistoryDropdown,
  NavigationControls,
  ThemeToggle,
  TopBarMenu,
  WorkingIndicator,
} from './index';

describe('TopBar index exports', () => {
  it('exports components', () => {
    expect(TopBar).toBeDefined();
    expect(ActionButtons).toBeDefined();
    expect(Breadcrumb).toBeDefined();
    expect(HistoryDropdown).toBeDefined();
    expect(NavigationControls).toBeDefined();
    expect(ThemeToggle).toBeDefined();
    expect(TopBarMenu).toBeDefined();
    expect(WorkingIndicator).toBeDefined();
  });
});
