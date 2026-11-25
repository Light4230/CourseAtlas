import http from 'node:http';

// Test-only OpenAI-compatible endpoint for local end-to-end verification.
// It never validates or logs the API key, and it is not part of the shipped app.
const PORT = Number(process.env.MOCK_LLM_PORT ?? 8787);

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
  });
  req.on('end', () => {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad json' }));
      return;
    }
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const system = String(messages.find((message) => message.role === 'system')?.content ?? '');
    const user = String(messages.find((message) => message.role === 'user')?.content ?? '');
    let answer;
    if (system.includes('retrieval planner')) {
      const noToolResults = /Tool results already collected:\s*None yet\./.test(user);
      if (!noToolResults) {
        answer = JSON.stringify({ done: true });
      } else {
        const question = user.match(/Question:\s*([\s\S]*?)\n\n/)?.[1] ?? user;
        if (/ppt|slide|lecture|课件|课程/i.test(question)) {
          answer = JSON.stringify({ tool: 'get_lecture_outline', arguments: {} });
        } else if (/perceptron|loss|train|感知机|损失|训练/i.test(question)) {
          answer = JSON.stringify({
            tool: 'search_chunks',
            arguments: { query: 'perceptron training', topK: 3 },
          });
        } else {
          answer = JSON.stringify({ done: true });
        }
      }
    } else if (system.includes('three-level outline')) {
      const pages = [...user.matchAll(/\[\[PAGE (\d+)\]\]/g)].map((match) => Number(match[1]));
      const page = (index) => pages[Math.min(index, Math.max(0, pages.length - 1))] ?? 1;
      const chapters = [0, 1, 2].map((chapterIndex) => ({
        title: ['Core concepts', 'Mechanisms and trade-offs', 'Application and evidence'][chapterIndex],
        summaryEn: `This chapter groups the main ideas of part ${chapterIndex + 1} and explains how the concepts connect.`,
        summaryZh: `本章归纳第 ${chapterIndex + 1} 部分的核心概念，并说明这些概念之间的关系。`,
        sourcePages: [page(chapterIndex * 3), page(chapterIndex * 3 + 1)],
        sections: [0, 1].map((sectionIndex) => ({
          title: `Section ${chapterIndex + 1}.${sectionIndex + 1}`,
          summaryEn: 'This section explains one sub-area and its role in the wider argument.',
          summaryZh: '本小节说明一个子主题及其在整体论证中的作用。',
          sourcePages: [page(chapterIndex * 3 + sectionIndex)],
          points: [0, 1].map((pointIndex) => ({
            title: `Knowledge point ${chapterIndex + 1}.${sectionIndex + 1}.${pointIndex + 1}`,
            summaryEn:
              'A mocked AI summary written for transport testing. It is deliberately not a real course claim.',
            summaryZh: '这是用于验证传输流程的模拟中文摘要，不代表真实课程内容。',
            keywords: ['mock', 'outline', 'review'],
            sourcePages: [page(chapterIndex * 3 + sectionIndex + pointIndex)],
          })),
        })),
      }));
      answer = JSON.stringify({ chapters });
    } else if (system.includes('supplied course excerpts') || system.includes('course tools')) {
      const source = user.match(/\[1\]\s+([^\n]+?)\s+\(/) ?? user.match(/\[([^\n]+?)\s+p\.(\d+)\]/);
      const label = source?.[1] ?? 'Lecture 1 - Perceptron and Backpropagation.pdf p.1';
      answer =
        'A perceptron computes a weighted sum of its inputs, adds a bias, and passes the result through an activation function. ' +
        'It is trained with an error-correcting update: when the prediction is wrong, each weight is adjusted in proportion to the input and the learning rate. ' +
        'A single perceptron is limited to linearly separable problems.\n\n' +
        `Source: [${label}].`;
    } else if (system.includes('web search snippets')) {
      answer =
        'According to the retrieved search results, the question is answered by the listed sources [1]. This mock response verifies that the web-source path is rendered.';
    } else if (system.includes('course knowledge base did not contain')) {
      answer =
        'This is a general-knowledge answer from the configured model, not a quotation from the course PDFs. ' +
        'France won the 2018 FIFA World Cup.';
    } else {
      answer = 'Mock model response.';
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'chatcmpl-mock',
        object: 'chat.completion',
        model: body.model ?? 'mock-tutor',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: answer },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    );
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-llm] listening on http://127.0.0.1:${PORT}/v1`);
});
