import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button, Dialog, TOAST_DURATION_MS, ToastProvider, useToast } from '../../src/components/ui';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Trigger() {
  const toast = useToast();
  return <Button onClick={() => toast.show('Saved it')}>Show</Button>;
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('lives in a polite status region that exists before any toast', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');
  });

  it('appears in that region, then dismisses itself after 2 seconds', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByRole('status').textContent).toBe('Saved it');

    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
    });
    expect(screen.getByRole('status').textContent).toBe('Saved it');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('stacks two toasts and removes each on its own timer', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    const button = screen.getByRole('button', { name: 'Show' });
    fireEvent.click(button);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(button);
    expect(screen.getAllByText('Saved it')).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getAllByText('Saved it')).toHaveLength(1);
  });

  it('useToast outside the provider fails loudly', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Trigger />)).toThrow();
    quiet.mockRestore();
  });
});

describe('Toast variants', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function Pair() {
    const toast = useToast();
    return (
      <>
        <Button onClick={() => toast.show('Recorded')}>Plain</Button>
        <Button onClick={() => toast.show('Refused', 'warning')}>Refuse</Button>
      </>
    );
  }

  const pillOf = (text: string) => {
    const pill = screen.getByText(text).closest('[data-variant]');
    if (pill === null) throw new Error(`no toast pill around "${text}"`);
    return pill;
  };
  const iconClass = (pill: Element) => pill.querySelector('svg')?.getAttribute('class') ?? '';

  it('a plain toast keeps the check-mark icon', () => {
    render(
      <ToastProvider>
        <Pair />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Plain' }));
    expect(pillOf('Recorded').getAttribute('data-variant')).toBe('success');
    expect(iconClass(pillOf('Recorded'))).toMatch(/check/);
  });

  it('a warning toast shows the alert icon and the warn edge, and not the check mark', () => {
    render(
      <ToastProvider>
        <Pair />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refuse' }));
    const pill = pillOf('Refused');
    expect(pill.getAttribute('data-variant')).toBe('warning');
    expect(iconClass(pill)).toMatch(/alert/);
    expect(iconClass(pill)).not.toMatch(/check/);
    expect(pill.className).toContain('border-warn');
    // The icon is decoration: the words carry the meaning.
    expect(pill.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Dialog', () => {
  const actions = (
    <>
      <Button variant="quiet">Keep</Button>
      <Button>Clear</Button>
    </>
  );

  it('renders nothing while closed', () => {
    render(
      <Dialog open={false} onClose={() => undefined} title="Sure?" closeLabel="Close" actions={actions}>
        Body
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a named modal dialog; focus starts on the first action', () => {
    render(
      <Dialog open onClose={() => undefined} title="Sure?" closeLabel="Close" actions={actions}>
        Body
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Sure?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep' }));
  });

  it('closes on Escape and on the close button', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Sure?" closeLabel="Close" actions={actions}>
        Body
      </Dialog>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps Tab inside: from the last control it wraps to the first', () => {
    render(
      <Dialog open onClose={() => undefined} title="Sure?" closeLabel="Close" actions={actions}>
        Body
      </Dialog>,
    );
    const last = screen.getByRole('button', { name: 'Clear' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });
});
