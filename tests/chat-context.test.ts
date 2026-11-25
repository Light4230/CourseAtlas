import { describe, expect, it } from 'vitest';
import { hasCjk, isOverviewQuestion } from '../server/chat/outline-context.js';
import { buildConversationMemory } from '../server/chat/memory.js';

describe('chat overview intent', () => {
  it('recognizes Chinese and English overview questions', () => {
    expect(isOverviewQuestion('这个ppt主要讲了那几个知识点')).toBe(true);
    expect(isOverviewQuestion('第一节课的课件讲了什么东西')).toBe(true);
    expect(isOverviewQuestion('What is this lecture about?')).toBe(true);
    expect(isOverviewQuestion('Week 2 主要讲什么')).toBe(true);
  });

  it('does not treat content questions as overviews', () => {
    expect(isOverviewQuestion('损失函数要怎么计算')).toBe(false);
    expect(isOverviewQuestion('What is a perceptron?')).toBe(false);
    expect(isOverviewQuestion('Explain backpropagation')).toBe(false);
  });

  it('detects Chinese text for query translation', () => {
    expect(hasCjk('损失函数怎么计算')).toBe(true);
    expect(hasCjk('loss function')).toBe(false);
  });
});

describe('two-layer conversation memory', () => {
  it('keeps recent turns and compresses older turns', () => {
    const messages = Array.from({ length: 6 }, (_, index) => ({
      question: `Question ${index + 1}`,
      answer: `Answer ${index + 1}`.padEnd(600, ' detail'),
    }));
    const memory = buildConversationMemory(messages, 3);
    expect(memory.summary).toContain('Question 1');
    expect(memory.summary).toContain('Answer 3');
    expect(memory.recentBlock).toContain('Question 4');
    expect(memory.recentBlock).toContain('Question 6');
    expect(memory.recentBlock).not.toContain('Question 1\n');
    expect(memory.isEmpty).toBe(false);
  });

  it('handles an empty history', () => {
    expect(buildConversationMemory([]).isEmpty).toBe(true);
  });

  it('does not promote a model-knowledge fallback into course memory', () => {
    const memory = buildConversationMemory([
      { question: 'No-evidence question', answer: 'No course evidence.', sourceType: 'model_knowledge' },
      { question: 'What is a perceptron?', answer: 'It is a linear classifier.', sourceType: 'course_material' },
    ]);
    expect(memory.recentBlock).not.toContain('No-evidence');
    expect(memory.recentBlock).toContain('perceptron');
  });
});
