import type { ReactNode } from 'react';

export type IconProps = {
  size?: number;
  className?: string;
  stroke?: string;
  open?: boolean;
};

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  badges?: string[];
};

export type SelectProps = {
  id?: string;
  label?: string;
  value: string;
  options?: SelectOption[];
  onChange?: (value: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
  tabIndex?: number;
  className?: string;
};

export type TooltipProps = {
  content: ReactNode;
  shortcut?: ReactNode;
  children: ReactNode;
  className?: string;
  suppressInitialFocus?: boolean;
};

export type DialogProps = {
  isOpen: boolean;
  title: string;
  message?: ReactNode;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: string;
  footer?: ReactNode;
  className?: string;
};

export type ContextMenuProps = {
  position: { x: number; y: number } | null;
  onClose: () => void;
  children: ReactNode;
};

export type ResizerProps = {
  onResize: (value: number) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
  onDoubleClick?: () => void;
  value?: number;
  min?: number;
  max?: number;
  label?: string;
  className?: string;
  disabled?: boolean;
  isCollapsed?: boolean;
};
