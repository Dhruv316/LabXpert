import { describe, expect, it } from 'vitest';
import { fixedClock } from './helpers';

describe('test helpers that caused the ConstraintError failures', () => {
  it('fixedClock never hands out the same id twice, even from two clocks', () => {
    const a = fixedClock();
    const b = fixedClock();
    const ids = [a.newId(), a.newId(), b.newId(), b.newId()];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('fixedClock ids and times still count up predictably within one clock', () => {
    const clock = fixedClock();
    const [first, second] = [clock.newId(), clock.newId()];
    expect(first.endsWith('-1')).toBe(true);
    expect(second.endsWith('-2')).toBe(true);
    expect(clock.now()).toBe(1001);
    expect(clock.now()).toBe(1002);
  });

  it('pointer events built by fireEvent keep their position, button and pointer id', () => {
    const seen = new PointerEvent('pointerdown', { clientX: 12, clientY: 34, button: 0, pointerId: 7 });
    expect(seen).toBeInstanceOf(MouseEvent);
    expect([seen.clientX, seen.clientY, seen.button, seen.pointerId]).toEqual([12, 34, 0, 7]);
  });
});
