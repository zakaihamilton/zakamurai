import Tooltip from '@/components/ui/Tooltip';
import { useToolbarButtonAction } from '@/hooks/useToolbarButtonAction';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './ToolbarButton.module.css';

export type ToolbarButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
  tooltip?: string;
  shortcut?: string;
  feedbackDuration?: number;
  completedIcon?: ReactNode;
};

export default function ToolbarButton({
  onClick,
  tooltip,
  shortcut,
  feedbackDuration = 1000,
  completedIcon,
  className = '',
  children,
  disabled,
  'aria-label': ariaLabel,
  'aria-pressed': ariaPressed,
  ...buttonProps
}: ToolbarButtonProps) {
  const { handleClick, isPressed, isExecuting, isCompleted } = useToolbarButtonAction(onClick, {
    feedbackDuration,
  });

  const activeIcon = isCompleted && completedIcon ? completedIcon : children;

  const combinedClass = [
    styles.toolbarBtn,
    isPressed ? styles.pressed : '',
    isExecuting ? styles.executing : '',
    isCompleted ? styles.completed : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const buttonElement = (
    <button
      type="button"
      {...buttonProps}
      className={combinedClass}
      onClick={handleClick}
      disabled={disabled || isExecuting}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      aria-busy={isExecuting}
      data-pressed={isPressed}
      data-completed={isCompleted}
    >
      {activeIcon}
    </button>
  );

  if (tooltip) {
    return (
      <Tooltip content={tooltip} shortcut={shortcut}>
        {buttonElement}
      </Tooltip>
    );
  }

  return buttonElement;
}
