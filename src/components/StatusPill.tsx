import { CheckCircle2, CircleDashed, Loader2, TriangleAlert, UploadCloud } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DocumentStatus } from '../types';

type VisualStatus = DocumentStatus | 'uploading' | 'rejected';

export function StatusPill({ status }: { status: VisualStatus }) {
  const { t } = useTranslation();
  const config = {
    queued: { icon: CircleDashed, cls: 'bg-slate-100 text-slate-600' },
    parsing: { icon: Loader2, cls: 'bg-sky-50 text-sky-700', spin: true },
    outlining: { icon: Loader2, cls: 'bg-violet-50 text-violet-700', spin: true },
    ready: { icon: CheckCircle2, cls: 'bg-teal-50 text-teal-700' },
    failed: { icon: TriangleAlert, cls: 'bg-red-50 text-red-700' },
    uploading: { icon: UploadCloud, cls: 'bg-sky-50 text-sky-700' },
    rejected: { icon: TriangleAlert, cls: 'bg-red-50 text-red-700' },
  }[status];
  const Icon = config.icon;
  return (
    <span className={`badge gap-1 ${config.cls}`}>
      <Icon size={11} className={config.spin ? 'animate-spin' : ''} />
      {t(`status.${status}`)}
    </span>
  );
}
