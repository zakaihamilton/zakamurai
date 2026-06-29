import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SidebarMountSection from './SidebarMountSection';

vi.mock('@/components/ui/Icons', () => ({ Icons: { FolderPlus: () => <span /> } }));

describe('SidebarMountSection', () => {
  it('shows Open Folder when no filesystem', () => {
    render(<SidebarMountSection hasFileSystem={false} onMountLocal={vi.fn()} />);
    expect(screen.getByText('Open Folder')).toBeDefined();
  });

  it('shows Relink Project when filesystem exists', () => {
    render(<SidebarMountSection hasFileSystem={true} onMountLocal={vi.fn()} />);
    expect(screen.getByText('Relink Project')).toBeDefined();
  });

  it('calls onMountLocal when clicked', () => {
    const onMountLocal = vi.fn();
    render(<SidebarMountSection hasFileSystem={false} onMountLocal={onMountLocal} />);
    fireEvent.click(screen.getByText('Open Folder'));
    expect(onMountLocal).toHaveBeenCalled();
  });
});
