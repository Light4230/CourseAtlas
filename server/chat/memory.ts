export interface MemoryMessage {
  question: string;
  answer: string;
  sourceType?: string;
}

export interface ConversationMemory {
  summary: string;
  recentBlock: string;
  isEmpty: boolean;
}

const SUMMARY_MAX_CHARS = 1_600;
const RECENT_MAX_CHARS = 2_400;

/**
 * Two layers:
 *  - recent turns are kept almost verbatim so follow-ups can resolve pronouns;
 *  - older turns are compressed into short Q/A memory lines.
 * This is extractive rather than an LLM summary, so it costs no extra model call.
 */
export function buildConversationMemory(
  messages: MemoryMessage[],
  recentCount = 3,
): ConversationMemory {
  if (messages.length === 0) {
    return { summary: '', recentBlock: '', isEmpty: true };
  }

  // Do not let a previous "no course evidence" fallback become long-term
  // course memory. It can otherwise teach the planner that the material is
  // missing even after tools have found it.
  const usable = messages.filter((message) => message.sourceType !== 'model_knowledge');
  if (usable.length === 0) {
    return { summary: '', recentBlock: '', isEmpty: true };
  }

  const recent = usable.slice(-recentCount);
  const older = usable.slice(0, -recentCount);
  const summaryLines = older.slice(-10).map((message) => {
    const question = clean(message.question, 140);
    const answer = clean(message.answer, 220);
    return `Q: ${question}\nA: ${answer}`;
  });
  const summary = cap(summaryLines.join('\n'), SUMMARY_MAX_CHARS);
  const recentBlock = cap(
    recent
      .map((message) => {
        return `Q: ${clean(message.question, 400)}\nA: ${clean(message.answer, 700)}`;
      })
      .join('\n\n'),
    RECENT_MAX_CHARS,
  );

  return { summary, recentBlock, isEmpty: false };
}

export function memoryPromptBlock(memory: ConversationMemory): string {
  if (memory.isEmpty) return '';
  const parts: string[] = [];
  if (memory.summary) parts.push(`Earlier conversation summary:\n${memory.summary}`);
  if (memory.recentBlock) parts.push(`Recent conversation:\n${memory.recentBlock}`);
  return parts.join('\n\n');
}

function clean(value: string, maxChars: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

function cap(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `…${value.slice(value.length - maxChars + 1)}`;
}
