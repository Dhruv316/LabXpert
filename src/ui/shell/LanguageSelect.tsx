import type { ChangeEvent } from 'react';
import { Globe } from 'lucide-react';
import { Icon } from '../../components/ui';
import { t, type Language, type UiKey } from '../../i18n';
import { useAppStore } from '../../state';

interface LanguageChoice {
  value: string;
  name: UiKey;
  /** Set only for a language whose files are loaded. The others stay visible but disabled. */
  language?: Language;
}

const CHOICES: readonly LanguageChoice[] = [
  { value: 'en', name: 'common.langEnglish', language: 'en' },
  { value: 'hi', name: 'common.langHindi' },
  { value: 'mr', name: 'common.langMarathi' },
];

export function LanguageSelect() {
  const language = useAppStore((state) => state.language);
  const setLanguage = useAppStore((state) => state.setLanguage);

  const onChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const picked = CHOICES.find((choice) => choice.value === event.target.value);
    if (picked?.language !== undefined) setLanguage(picked.language);
  };

  return (
    <label className="inline-flex items-center gap-2 font-body text-ink">
      <Icon icon={Globe} />
      <span className="sr-only">{t('common.language')}</span>
      <select
        value={language}
        onChange={onChange}
        className="h-11 rounded-control border-2 border-ink-soft bg-white px-3 font-body text-ink focus-visible:border-teal-deep focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-0 focus-visible:outline-teal"
      >
        {CHOICES.map((choice) => (
          <option key={choice.value} value={choice.value} disabled={choice.language === undefined}>
            {choice.language === undefined
              ? `${t(choice.name)}: ${t('common.comingSoon')}`
              : t(choice.name)}
          </option>
        ))}
      </select>
    </label>
  );
}
