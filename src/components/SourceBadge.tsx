import { BookOpenCheck, Globe2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SourceType } from '../types';

const STYLES: Record<
  SourceType,
  { className: string; icon: typeof BookOpenCheck; key: string }
> = {
  course_material: {
    className: 'bg-evidence/10 text-evidence ring-1 ring-inset ring-evidence/20',
    icon: BookOpenCheck,
    key: 'badges.courseMaterial',
  },
  model_knowledge: {
    className: 'bg-model/10 text-model ring-1 ring-inset ring-model/20',
    icon: Sparkles,
    key: 'badges.modelKnowledge',
  },
  web: {
    className: 'bg-web/10 text-web ring-1 ring-inset ring-web/20',
    icon: Globe2,
    key: 'badges.web',
  },
  mixed: {
    className: 'bg-web/10 text-web ring-1 ring-inset ring-web/20',
    icon: Globe2,
    key: 'badges.mixed',
  },
};

export function SourceBadge({ sourceType, short = false }: { sourceType: SourceType; short?: boolean }) {
  const { t } = useTranslation();
  const style = STYLES[sourceType];
  const Icon = style.icon;
  const shortKey = {
    course_material: 'badges.courseShort',
    model_knowledge: 'badges.modelShort',
    web: 'badges.webShort',
    mixed: 'badges.mixedShort',
  }[sourceType];
  return (
    <span className={`badge max-w-full text-left leading-4 ${style.className}`}>
      <Icon size={11} className="shrink-0" />
      <span>{t(short ? shortKey : style.key)}</span>
    </span>
  );
}
