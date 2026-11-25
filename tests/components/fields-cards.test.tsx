import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Card, Field, Notice } from '../../src/components/ui';

afterEach(cleanup);

describe('Field', () => {
  it('shows a visible label tied to the input', () => {
    render(<Field label="User ID" />);
    const input = screen.getByLabelText('User ID') as HTMLInputElement;
    expect(input.tagName).toBe('INPUT');
    expect(input.className).toContain('h-12');
    expect(input.className).toContain('focus-visible:outline-teal');
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('links the hint and shows an error with an icon, not colour alone', () => {
    render(<Field label="User ID" hint="Any ID works" error="Type an ID" />);
    const input = screen.getByLabelText('User ID');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = (input.getAttribute('aria-describedby') ?? '').split(' ');
    const texts = described.map((id) => document.getElementById(id)?.textContent ?? '');
    expect(texts.join(' ')).toContain('Any ID works');
    expect(texts.join(' ')).toContain('Type an ID');
    const message = screen.getByText('Type an ID').closest('p');
    expect(message?.querySelector('svg')).not.toBeNull();
    expect(input.className).toContain('border-error');
  });

  it('keeps an empty polite live region so a new error is announced', () => {
    render(<Field label="User ID" />);
    const input = screen.getByLabelText('User ID');
    const regionId = (input.getAttribute('aria-describedby') ?? '').split(' ').pop() ?? '';
    expect(document.getElementById(regionId)?.getAttribute('aria-live')).toBe('polite');
  });

  it('can be disabled and passes the value type through', () => {
    render(<Field label="Answer" type="number" disabled />);
    const input = screen.getByLabelText('Answer') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.type).toBe('number');
  });
});

describe('Card and Notice', () => {
  it('Card renders its children with the card radius and lift shadow', () => {
    render(<Card as="article">Hello</Card>);
    const card = screen.getByText('Hello');
    expect(card.tagName).toBe('ARTICLE');
    expect(card.className).toContain('rounded-card');
    expect(card.className).toContain('shadow-lift');
  });

  it.each([
    ['error', 'alert'],
    ['ok', 'status'],
    ['info', 'status'],
  ] as const)('Notice %s uses role %s and has an icon', (tone, role) => {
    render(<Notice tone={tone}>Message</Notice>);
    const notice = screen.getByRole(role);
    expect(notice.textContent).toBe('Message');
    expect(notice.querySelector('svg')).not.toBeNull();
  });
});
