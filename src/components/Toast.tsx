import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

export function ToastStack({
  items,
  onDismiss,
  dismissLabel,
}: {
  items: ToastItem[];
  onDismiss: (id: string) => void;
  dismissLabel: string;
}) {
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,460px)] -translate-x-1/2 flex-col gap-2">
      {items.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto flex animate-fade-up items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-float ${
            toast.tone === 'success'
              ? 'border-teal-700/20 bg-[#f2fbf8] text-teal-800'
              : toast.tone === 'error'
                ? 'border-red-700/20 bg-[#fdf4f3] text-red-800'
                : 'border-line bg-white text-ink'
          }`}
        >
          {toast.tone === 'success' ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          ) : toast.tone === 'error' ? (
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
          ) : (
            <Info size={16} className="mt-0.5 shrink-0" />
          )}
          <span className="min-w-0 flex-1 leading-5">{toast.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="btn-icon -mr-1 -mt-1 h-6 w-6 shrink-0"
            aria-label={dismissLabel}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
