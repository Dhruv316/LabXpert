import { afterEach, describe, expect, it, vi } from 'vitest';
import { Check } from 'lucide-react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button, Chip, IconButton } from '../../src/components/ui';

afterEach(cleanup);

describe('Button', () => {
  it.each(['primary', 'secondary', 'quiet'] as const)('renders the %s variant as a native button', (variant) => {
    render(<Button variant={variant}>Go</Button>);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('data-variant')).toBe(variant);
  });

  it('keeps the 48 px minimum height and the focus-visible ring classes', () => {
    render(<Button>Go</Button>);
    const classes = screen.getByRole('button').className;
    expect(classes).toContain('min-h-[48px]');
    expect(classes).toContain('focus-visible:outline-teal');
    expect(classes).toContain('focus-visible:outline-[3px]');
  });

  it('calls onClick once for a click', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('activates once on Enter', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not repeat while Enter is held', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: 'Enter', repeat: true });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('activates once on Space, when the key is released', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: ' ' });
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.keyUp(button, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: 'a' });
    fireEvent.keyUp(button, { key: 'a' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disabled blocks clicks and keys, and is exposed as disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    );
    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: ' ' });
    fireEvent.keyUp(button, { key: ' ' });
    expect(onClick).not.toHaveBeenCalled();
    expect(button.className).toContain('opacity-40');
  });

  it('with a reason, stays focusable, blocks clicks and keys, and explains why', () => {
    const onClick = vi.fn();
    render(
      <Button disabled disabledReason="Because" onClick={onClick}>
        Go
      </Button>,
    );
    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyUp(button, { key: ' ' });
    expect(onClick).not.toHaveBeenCalled();

    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toBe('Because');
    expect(button.getAttribute('aria-describedby')).toBe(tip.id);
    expect(tip.className).toContain('hidden');
    fireEvent.focus(button);
    expect(tip.className).not.toContain('hidden');
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(tip.className).toContain('hidden');
  });

  it('shows its icon without adding a name', () => {
    render(<Button icon={Check}>Go</Button>);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('IconButton', () => {
  it('is named by its label, is at least 44 px, and shows the focus ring classes', () => {
    render(<IconButton icon={Check} label="Close" />);
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button.className).toContain('h-11');
    expect(button.className).toContain('w-11');
    expect(button.className).toContain('focus-visible:outline-teal');
  });

  it('activates by click, Enter and Space; disabled blocks all three', () => {
    const onClick = vi.fn();
    const { rerender } = render(<IconButton icon={Check} label="Close" onClick={onClick} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: ' ' });
    fireEvent.keyUp(button, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(3);

    onClick.mockClear();
    rerender(<IconButton icon={Check} label="Close" onClick={onClick} disabled />);
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyUp(button, { key: ' ' });
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Chip', () => {
  it('is plain text with an icon when it has no handler', () => {
    render(<Chip tone="ok">Done</Chip>);
    expect(screen.queryByRole('button')).toBeNull();
    const chip = screen.getByText('Done').closest('[data-tone]');
    expect(chip?.getAttribute('data-tone')).toBe('ok');
    expect(chip?.querySelector('svg')).not.toBeNull();
  });

  it('becomes a 44 px button with focus ring when it has a handler', () => {
    const onClick = vi.fn();
    render(
      <Chip tone="error" onClick={onClick}>
        Check this
      </Chip>,
    );
    const button = screen.getByRole('button', { name: 'Check this' });
    expect(button.className).toContain('min-h-[44px]');
    expect(button.className).toContain('focus-visible:outline-teal');
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
