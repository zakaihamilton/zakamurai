import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppErrorBoundary from './AppErrorBoundary';

function Boom() {
  throw new Error('boom');
}

describe('AppErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when there is no error', () => {
    render(
      <AppErrorBoundary>
        <div>ok</div>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('ok')).toBeDefined();
  });

  it('shows fallback UI, focuses the heading, and reloads on button click', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(() => {});
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload },
    });

    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeDefined();
    expect(alert.getAttribute('aria-describedby')).toBe('app-error-details');
    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByText(/Error: boom/)).toBeDefined();
    expect(focusSpy).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalled();
  });

  it('Try again clears the error and remounts children', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('flaky');
      return <div>recovered</div>;
    }

    render(
      <AppErrorBoundary>
        <Flaky />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeDefined();
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('recovered')).toBeDefined();
  });

  it('renders string throwables as details', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function BoomString() {
      throw 'string failure';
    }
    render(
      <AppErrorBoundary>
        <BoomString />
      </AppErrorBoundary>,
    );
    expect(screen.getByText('string failure')).toBeDefined();
  });

  it('renders a generic message for non-Error throwables', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function BoomObject() {
      throw { reason: 'nope' };
    }
    render(
      <AppErrorBoundary>
        <BoomObject />
      </AppErrorBoundary>,
    );
    expect(screen.getByText('An unexpected error occurred.')).toBeDefined();
  });
});
