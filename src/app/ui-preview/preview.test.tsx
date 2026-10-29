import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Preview from './preview';

afterEach(() => window.history.replaceState(null, '', '/'));

function choosePreviewDropdownOption(label: string, option: string) {
  const trigger = screen
    .getByText(label, { selector: '.ui-preview-dropdown__label' })
    .closest('summary');
  if (!trigger) throw new Error(`Could not find ${label} dropdown trigger`);
  const dropdown = trigger.closest('details');
  if (!dropdown) throw new Error(`Could not find ${label} dropdown`);
  fireEvent.click(trigger);
  fireEvent.click(within(dropdown).getByRole('button', { name: option }));
}

describe('UI preview', () => {
  it('loads URL fixtures and resets edits when switching screens', async () => {
    window.history.replaceState(null, '', '/ui-preview?screen=editor&scenario=populated');
    render(<Preview />);
    const editor = await screen.findByRole('textbox');
    fireEvent.change(editor, { target: { value: 'unsaved fixture' } });
    choosePreviewDropdownOption('Screen', 'Logs');
    expect(await screen.findByText('Preview ready.')).toBeTruthy();
    choosePreviewDropdownOption('Screen', 'Editor');
    await waitFor(() =>
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).not.toBe(
        'unsaved fixture',
      ),
    );
  });

  it('blocks the welcome prompt submission', async () => {
    render(<Preview />);
    const prompt = await screen.findByRole('textbox', { name: 'Describe what you want to build' });
    fireEvent.change(prompt, { target: { value: 'Make a demo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start building with AI' }));
    expect(screen.queryByText('Download local AI model?')).toBeNull();
  });
});

describe('workspace fixtures', () => {
  it('renders and locally reviews the production diff', async () => {
    window.history.replaceState(null, '', '/ui-preview?screen=diff');
    render(<Preview />);
    expect(await screen.findByText('Original')).toBeTruthy();
    expect(screen.getByText('Modified')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(screen.queryByText('Original')).toBeNull();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('Hello, world!');
  });

  it('renders the conversation and error fixture without submitting', async () => {
    window.history.replaceState(null, '', '/ui-preview?screen=agent&scenario=error');
    render(<Preview />);
    expect(await screen.findByText('Update the welcome heading.')).toBeTruthy();
    expect(screen.getByRole('alert')).toHaveTextContent('The local model stopped responding.');
    const input = screen.getByPlaceholderText('Tell the AI Manager what to do...');
    fireEvent.change(input, { target: { value: 'Another request' } });
    const form = input.closest('form');
    expect(form).not.toBeNull();
    if (form) fireEvent.submit(form);
    expect(screen.queryByText('Download local AI model?')).toBeNull();
  });

  it('renders preview empty and error states', async () => {
    window.history.replaceState(null, '', '/ui-preview?screen=preview&scenario=empty');
    render(<Preview />);
    expect(await screen.findByText('No Preview Available')).toBeTruthy();
    choosePreviewDropdownOption('Scenario', 'Error');
    expect(screen.getByRole('alert')).toHaveTextContent('could not be built');
  });

  it('renders storage failure and a synthetic recovery action', async () => {
    window.history.replaceState(null, '', '/ui-preview?screen=storage&scenario=error');
    render(<Preview />);
    expect(await screen.findByText(/could not save them/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Export ZIP' }));
    await waitFor(() => expect(screen.queryByText(/could not save them/)).toBeNull());
  });

  it('renders model and download dialogs with fixture actions', async () => {
    window.history.replaceState(null, '', '/ui-preview?screen=models');
    render(<Preview />);
    expect(await screen.findByRole('heading', { name: 'AI Models' })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Close dialog' })[0]);
    choosePreviewDropdownOption('Screen', 'Download');
    expect(await screen.findByRole('heading', { name: 'Download local AI model?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download and build' }));
    expect(screen.queryByRole('heading', { name: 'Download local AI model?' })).toBeNull();
  });

  it('renders the workspace explorer and tab', async () => {
    window.history.replaceState(null, '', '/ui-preview?screen=workspace');
    render(<Preview />);
    expect(await screen.findByText('Explorer')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /App.tsx/ })).toBeTruthy();
  });
});
