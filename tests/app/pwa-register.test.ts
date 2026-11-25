import { describe, expect, it, vi } from 'vitest';

interface RegisterOptions {
  immediate?: boolean;
  onRegisterError?: (error: unknown) => void;
}

const registerSW = vi.hoisted(() => vi.fn<(options?: RegisterOptions) => void>());
vi.mock('virtual:pwa-register', () => ({ registerSW }));

import { registerOffline } from '../../src/pwa-register';

describe('registerOffline', () => {
  it('starts the service worker once', () => {
    registerSW.mockReset();
    registerOffline();
    expect(registerSW).toHaveBeenCalledTimes(1);
    expect(registerSW.mock.calls[0]?.[0]?.immediate).toBe(true);
  });

  it('does not throw when the registration call throws', () => {
    registerSW.mockReset();
    registerSW.mockImplementation(() => {
      throw new Error('service workers are blocked');
    });
    expect(() => registerOffline()).not.toThrow();
  });

  it('does not throw when the worker reports a registration error later', () => {
    registerSW.mockReset();
    registerOffline();
    const onError = registerSW.mock.calls[0]?.[0]?.onRegisterError;
    expect(onError).toBeTypeOf('function');
    expect(() => onError?.(new Error('failed'))).not.toThrow();
  });
});
