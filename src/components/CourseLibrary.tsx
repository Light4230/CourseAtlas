import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Course } from '../types';
import { formatDate } from '../lib/format';

interface CourseLibraryProps {
  courses: Course[];
  selectedCourseId: string | null;
  language: string;
  onSelect: (courseId: string) => void;
  onCreate: () => void;
  onRename: (course: Course) => void;
  onDelete: (course: Course) => void;
}

export function CourseLibrary({
  courses,
  selectedCourseId,
  language,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: CourseLibraryProps) {
  const { t } = useTranslation();

  return (
    <section className="px-3 pb-3 pt-4">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-teal-700" />
          <h2 className="section-label">{t('courses.library')}</h2>
          <span className="rounded-full bg-ink/[0.06] px-1.5 py-0.5 text-[10px] font-bold text-muted">
            {courses.length}
          </span>
        </div>
        <button
          type="button"
          className="btn-ghost h-7 gap-1 px-2 text-[11px]"
          onClick={onCreate}
          aria-label={t('a11y.newCourse')}
        >
          <Plus size={13} />
          {t('courses.new')}
        </button>
      </div>

      {courses.length === 0 ? (
        <button
          type="button"
          onClick={onCreate}
          className="group flex w-full flex-col items-start gap-1 rounded-xl border border-dashed border-line bg-white/45 px-3 py-3 text-left transition hover:border-teal-700/40 hover:bg-white/80"
        >
          <span className="text-sm font-semibold text-ink">{t('courses.emptyTitle')}</span>
          <span className="text-[11px] leading-4 text-muted">{t('courses.emptyBody')}</span>
        </button>
      ) : (
        <div className="scrollbar-none flex max-h-[190px] flex-col gap-1.5 overflow-y-auto pr-0.5">
          {courses.map((course) => {
            const selected = course.id === selectedCourseId;
            return (
              <div key={course.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelect(course.id)}
                  aria-label={t('a11y.courseSelect', { name: course.name })}
                  className={`w-full rounded-xl border py-2.5 pl-3 pr-14 text-left transition ${
                    selected
                      ? 'border-teal-700/30 bg-white shadow-sm'
                      : 'border-transparent bg-white/45 hover:border-line hover:bg-white/75'
                  }`}
                >
                  <span
                    className="absolute bottom-3 left-0 top-3 w-[3px] rounded-r-full"
                    style={{ backgroundColor: selected ? course.color : 'transparent' }}
                  />
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: course.color }}
                    />
                    <span className="truncate text-[13px] font-semibold text-ink">{course.name}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[10.5px] text-muted">
                    {t('courses.stats', {
                      documents: course.documentCount,
                      lectures: course.lectureCount,
                      topics: course.topicCount,
                    })}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-muted/80">
                    {t('courses.updated', { date: formatDate(course.updatedAt, language) })}
                  </span>
                </button>
                <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <button
                    type="button"
                    className="btn-icon h-6 w-6 bg-white/70"
                    onClick={() => onRename(course)}
                    title={t('courses.renameTitle')}
                    aria-label={t('courses.renameTitle')}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    className="btn-icon h-6 w-6 bg-white/70 hover:text-red-700"
                    onClick={() => onDelete(course)}
                    title={t('courses.deleteTitle')}
                    aria-label={t('courses.deleteTitle')}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
