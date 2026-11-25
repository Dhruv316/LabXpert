import { useState, type ReactNode } from 'react';
import { Check, Trash2, Undo2, X } from 'lucide-react';
import { t } from '../../i18n';
import { Ollie, type OllieMood } from '../Ollie';
import { Button, type ButtonVariant } from './Button';
import { Card } from './Card';
import { Chip } from './Chip';
import { Dialog, DialogPanel } from './Dialog';
import { Field } from './Field';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Notice } from './Notice';
import { ToastPill, useToast } from './Toast';
import { Tooltip } from './Tooltip';
import './gallery.css';

/*
 * Dev-only check by eye (npm run dev). Every text comes from t() with existing keys.
 * Captions are printed by CSS from data-caption / data-group, so no text literals live here.
 * data-demo-state forces hover, active and focus, which need a real pointer or key otherwise.
 */

type DemoState = 'default' | 'hover' | 'active' | 'focus';
const DEMO_STATES: readonly DemoState[] = ['default', 'hover', 'active', 'focus'];
const demo = (state: DemoState) => (state === 'default' ? {} : { 'data-demo-state': state });

const MOODS: readonly OllieMood[] = ['happy', 'thinking', 'celebrating'];
const STATUS = [
  { status: 'not_started', tone: 'neutral', label: t('picker.status.not_started') },
  { status: 'in_progress', tone: 'progress', label: t('picker.status.in_progress') },
  { status: 'done', tone: 'ok', label: t('picker.status.done') },
] as const;

function Cell({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="gallery-cell" data-caption={caption}>
      {children}
    </div>
  );
}

function Group({ name, component, children }: { name: string; component: string; children: ReactNode }) {
  return (
    <section className="gallery-group" data-group={name} data-gallery-component={component}>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-6">{children}</div>
    </section>
  );
}

const BUTTONS: ReadonlyArray<{ variant: ButtonVariant; label: string }> = [
  { variant: 'primary', label: t('bench.record') },
  { variant: 'secondary', label: t('bench.check') },
  { variant: 'quiet', label: t('common.cancel') },
];

function ButtonShowcase() {
  return (
    <>
      {BUTTONS.flatMap(({ variant, label }) => [
        ...DEMO_STATES.map((state) => (
          <Cell key={`${variant}-${state}`} caption={`${variant} ${state}`}>
            <Button variant={variant} {...demo(state)}>
              {label}
            </Button>
          </Cell>
        )),
        <Cell key={`${variant}-icon`} caption={`${variant} with icon`}>
          <Button variant={variant} icon={Check}>
            {label}
          </Button>
        </Cell>,
        <Cell key={`${variant}-disabled`} caption={`${variant} disabled`}>
          <Button variant={variant} disabled>
            {label}
          </Button>
        </Cell>,
      ])}
      <Cell caption="disabled with reason (hover or focus)">
        <Button disabled disabledReason={t('bench.recordNeedVoltage')}>
          {t('bench.record')}
        </Button>
      </Cell>
    </>
  );
}

const ICON_BUTTONS = [
  { icon: X, label: t('common.close') },
  { icon: Undo2, label: t('bench.undo') },
  { icon: Trash2, label: t('bench.deleteSelected') },
] as const;

function IconButtonShowcase() {
  return (
    <>
      {ICON_BUTTONS.map(({ icon, label }) =>
        DEMO_STATES.map((state) => (
          <Cell key={`${label}-${state}`} caption={state}>
            <IconButton icon={icon} label={label} {...demo(state)} />
          </Cell>
        )),
      )}
      <Cell caption="disabled">
        <IconButton icon={Undo2} label={t('bench.undo')} disabled />
      </Cell>
    </>
  );
}

function ToastShowcase() {
  const toast = useToast();
  return (
    <>
      <Cell caption="pill">
        <ToastPill>{t('bench.recordedToast')}</ToastPill>
      </Cell>
      <Cell caption="warning pill">
        <ToastPill variant="warning">{t('bench.wireDuplicate')}</ToastPill>
      </Cell>
      <Cell caption="live toast, 2 s">
        <Button variant="secondary" onClick={() => toast.show(t('bench.recordedToast'))}>
          {t('bench.record')}
        </Button>
      </Cell>
    </>
  );
}

function DialogShowcase() {
  const [open, setOpen] = useState(false);
  const actions = (
    <>
      <Button variant="quiet" onClick={() => setOpen(false)}>
        {t('bench.resetConfirmNo')}
      </Button>
      <Button onClick={() => setOpen(false)}>{t('bench.resetConfirmYes')}</Button>
    </>
  );
  const body = <p>{t('bench.resetConfirmBody')}</p>;

  return (
    <>
      <Cell caption="panel">
        <DialogPanel title={t('bench.resetConfirmTitle')} titleId="gallery-dialog-title" closeLabel={t('common.close')} onClose={() => undefined} actions={actions}>
          {body}
        </DialogPanel>
      </Cell>
      <Cell caption="modal (opens on top)">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t('bench.reset')}
        </Button>
        <Dialog open={open} onClose={() => setOpen(false)} title={t('bench.resetConfirmTitle')} closeLabel={t('common.close')} actions={actions}>
          {body}
        </Dialog>
      </Cell>
    </>
  );
}

export default function Gallery() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-12 p-8">
      <header>
        <h1 className="font-heading text-[40px] font-semibold leading-[48px]">{t('app.name')}</h1>
        <p className="text-ink-soft">{t('app.tagline')}</p>
      </header>

      <Group name="buttons" component="Button">
        <ButtonShowcase />
      </Group>

      <Group name="icon buttons" component="IconButton">
        <IconButtonShowcase />
      </Group>

      <Group name="icons" component="Icon">
        <Cell caption="decorative">
          <Icon icon={Check} />
        </Cell>
        <Cell caption="labelled, 32 px">
          <Icon icon={Check} size={32} label={t('picker.status.done')} />
        </Cell>
      </Group>

      <Group name="fields" component="Field">
        {DEMO_STATES.map((state) => (
          <Cell key={state} caption={state}>
            <Field label={t('login.userId')} {...demo(state)} />
          </Cell>
        ))}
        <Cell caption="with hint">
          <Field label={t('login.password')} type="password" hint={t('login.note')} />
        </Cell>
        <Cell caption="error">
          <Field label={t('login.userId')} error={t('login.needBoth')} />
        </Cell>
        <Cell caption="disabled">
          <Field label={t('practice.calcAnswer')} type="number" disabled />
        </Cell>
      </Group>

      <Group name="chips" component="Chip">
        {STATUS.map(({ status, tone, label }) => (
          <Cell key={status} caption={`status ${status}`}>
            <Chip tone={tone}>{label}</Chip>
          </Cell>
        ))}
        <Cell caption="error">
          <Chip tone="error">{t('errorTopics.OPEN_CIRCUIT')}</Chip>
        </Cell>
        {DEMO_STATES.map((state) => (
          <Cell key={state} caption={`button chip ${state}`}>
            <Chip tone="error" onClick={() => undefined} {...demo(state)}>
              {t('errorTopics.WRONG_POLARITY')}
            </Chip>
          </Cell>
        ))}
      </Group>

      <Group name="notices" component="Notice">
        <Cell caption="error">
          <Notice tone="error">{t('bench.overload')}</Notice>
        </Cell>
        <Cell caption="ok">
          <Notice tone="ok">{t('practice.calcCorrect')}</Notice>
        </Cell>
        <Cell caption="info">
          <Notice tone="info">{t('common.offline')}</Notice>
        </Cell>
      </Group>

      <Group name="cards" component="Card">
        <Card as="article" className="max-w-sm">
          <h3 className="font-heading text-xl font-medium">{t('exp.ohms-law.title')}</h3>
          <p>{t('exp.ohms-law.summary')}</p>
        </Card>
      </Group>

      <Group name="tooltip" component="Tooltip">
        <div className="pt-12">
          <Tooltip content={t('bench.recordNeedVoltage')} defaultOpen>
            {(describedBy) => (
              <Button variant="quiet" aria-describedby={describedBy}>
                {t('bench.record')}
              </Button>
            )}
          </Tooltip>
        </div>
      </Group>

      <Group name="toasts" component="Toast">
        <ToastShowcase />
      </Group>

      <Group name="dialog" component="Dialog">
        <DialogShowcase />
      </Group>

      <section className="gallery-group" data-group="Ollie" data-gallery-component="Ollie">
        <div className="flex flex-wrap items-end gap-8">
          {MOODS.map((mood) => (
            <Cell key={mood} caption={mood}>
              <Ollie mood={mood} />
            </Cell>
          ))}
          <Cell caption="decorative, 140 px">
            <Ollie mood="happy" size={140} decorative />
          </Cell>
        </div>
      </section>
    </main>
  );
}
