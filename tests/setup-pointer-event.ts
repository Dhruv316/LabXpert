import { configure } from '@testing-library/react';

// The bench screen opens through Dexie and lazy chunks. In a full run (60+ files in parallel) that can take
// longer than Testing Library's 1000 ms default, so findBy and waitFor wait up to 5 s before giving up.
configure({ asyncUtilTimeout: 5000 });

// jsdom 25 has no PointerEvent. Without it, fireEvent.pointerDown/Move/Up build a plain Event that
// drops clientX, clientY, button and pointerId, so drag handlers see NaN positions and ignore the press.
// This is the smallest stand-in: a MouseEvent that also carries pointerId and pointerType.
if (typeof window !== 'undefined' && typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }
  Object.defineProperty(window, 'PointerEvent', { value: PointerEventPolyfill, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'PointerEvent', { value: PointerEventPolyfill, configurable: true, writable: true });
}
