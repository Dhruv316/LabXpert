import { useRef, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Ollie } from '../../components/Ollie';
import { Button, Card, Field } from '../../components/ui';
import { appNow, loginUser, normaliseUserId } from '../../db';
import { t } from '../../i18n';
import { useAppStore, useDb } from '../../state';
import { useCrash } from '../shell/use-crash';

type InvalidField = 'userId' | 'password';

/** Login (UI_SCREENS §1). Always accepts; the only check is that both fields have something in them. */
export function LoginScreen() {
  const db = useDb();
  const user = useAppStore((state) => state.user);
  const setUser = useAppStore((state) => state.setUser);
  const crash = useCrash();
  // Both inputs are uncontrolled: the password is read once on submit and never enters state.
  const userIdRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [invalid, setInvalid] = useState<InvalidField | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  // Once the store has a user (this login or an earlier one) the guard-free login route moves on.
  if (user !== undefined) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const typedId = userIdRef.current?.value ?? '';
    const passwordTyped = (passwordRef.current?.value ?? '') !== '';

    // An ID of only spaces is empty once normalised, so it counts as empty.
    const firstInvalid: InvalidField | undefined =
      normaliseUserId(typedId) === '' ? 'userId' : passwordTyped ? undefined : 'password';
    if (firstInvalid !== undefined) {
      setInvalid(firstInvalid);
      (firstInvalid === 'userId' ? userIdRef : passwordRef).current?.focus();
      return;
    }

    // Presence is all that is checked. Wipe the password before anything else happens.
    if (passwordRef.current !== null) passwordRef.current.value = '';
    setInvalid(undefined);
    setBusy(true);
    try {
      // The store update makes the redirect above send the learner to the picker.
      setUser(await loginUser(db, typedId, appNow()));
    } catch (error) {
      crash(error);
    }
  };

  const clearError = () => {
    if (invalid !== undefined) setInvalid(undefined);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream p-8">
      <Card as="section" className="flex w-full max-w-3xl flex-wrap items-center justify-center gap-8">
        <div className="flex basis-56 flex-col items-center gap-4">
          <p className="relative rounded-card border-2 border-wood bg-white px-4 py-3 text-center font-semibold">
            {t('login.owlGreeting')}
            <span
              aria-hidden="true"
              className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-wood bg-white"
            />
          </p>
          <Ollie mood="happy" size={140} decorative />
        </div>
        <form noValidate aria-labelledby="login-title" onSubmit={(event) => void submit(event)} className="flex min-w-0 flex-1 basis-72 flex-col gap-4">
          <h1 id="login-title" className="font-heading text-[2rem] font-semibold leading-10">
            {t('login.title')}
          </h1>
          <Field
            ref={userIdRef}
            name="userId"
            label={t('login.userId')}
            autoComplete="username"
            autoFocus
            onChange={clearError}
            error={invalid === 'userId' ? t('login.needBoth') : undefined}
          />
          <Field
            ref={passwordRef}
            name="password"
            type="password"
            label={t('login.password')}
            autoComplete="current-password"
            onChange={clearError}
            error={invalid === 'password' ? t('login.needBoth') : undefined}
          />
          <Button type="submit" icon={ArrowRight} disabled={busy}>
            {t('login.submit')}
          </Button>
          <p className="text-sm text-ink-soft">{t('login.note')}</p>
        </form>
      </Card>
    </main>
  );
}
