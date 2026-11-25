/**
 * LLM answers commonly use \(...\) and \[...\] for math, while remark-math
 * expects $...$ and $$...$$. Normalize only outside fenced code blocks.
 */
export function normalizeMathDelimiters(text: string): string {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part
        .replace(/\\\[([\s\S]*?)\\\]/g, (_match, body: string) => {
          return `\n\n$$\n${body.trim()}\n$$\n\n`;
        })
        .replace(/\\\(([\s\S]*?)\\\)/g, (_match, body: string) => {
          return `$${body.trim()}$`;
        });
    })
    .join('');
}
