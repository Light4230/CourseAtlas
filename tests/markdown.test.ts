import { describe, expect, it } from 'vitest';
import { normalizeMathDelimiters } from '../src/lib/markdown.js';

describe('Markdown math normalization', () => {
  it('converts inline and display LaTeX delimiters', () => {
    const input = 'Use \\(\\hat y\\) and\n\\[\nL(\\theta)=\\frac1N\\sum_i \\ell_i\n\\]';
    const output = normalizeMathDelimiters(input);
    expect(output).toContain('$\\hat y$');
    expect(output).toContain('$$\nL(\\theta)=\\frac1N\\sum_i \\ell_i\n$$');
    expect(output).not.toContain('\\(');
    expect(output).not.toContain('\\[');
  });

  it('does not rewrite LaTeX inside fenced code blocks', () => {
    const input = '```tex\n\\(x\\)\n```\nOutside \\(y\\)';
    const output = normalizeMathDelimiters(input);
    expect(output).toContain('```tex\n\\(x\\)\n```');
    expect(output).toContain('Outside $y$');
  });
});
