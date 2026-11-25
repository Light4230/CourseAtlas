import type { Topic } from '../types';

export interface TopicNode extends Topic {
  children: TopicNode[];
  depth: number;
}

export function buildTopicTree(topics: Topic[]): TopicNode[] {
  const nodes = new Map<string, TopicNode>();
  for (const topic of topics) {
    nodes.set(topic.id, { ...topic, children: [], depth: 0 });
  }
  const roots: TopicNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      const parent = nodes.get(node.parentId)!;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (list: TopicNode[], depth: number) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const node of list) {
      node.depth = depth;
      sortNodes(node.children, depth + 1);
    }
  };
  sortNodes(roots, 0);
  return roots;
}

export function flattenTopicTree(nodes: TopicNode[]): TopicNode[] {
  return nodes.flatMap((node) => [node, ...flattenTopicTree(node.children)]);
}

export function findTopicNode(topics: Topic[], topicId: string): TopicNode | null {
  return flattenTopicTree(buildTopicTree(topics)).find((topic) => topic.id === topicId) ?? null;
}

export function topicAncestors(topics: Topic[], topicId: string): Topic[] {
  const byId = new Map(topics.map((topic) => [topic.id, topic]));
  const ancestors: Topic[] = [];
  let current = byId.get(topicId);
  let guard = 0;
  while (current?.parentId && guard < 12) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    ancestors.unshift(parent);
    current = parent;
    guard += 1;
  }
  return ancestors;
}

export function siblingTopics(topics: Topic[], topic: Topic | null): Topic[] {
  if (!topic) return [];
  return topics
    .filter((item) => item.parentId === topic.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function findDeepestTopicForPage(
  topics: Topic[],
  documentId: string,
  page: number,
): Topic | null {
  const matches = topics.filter((topic) =>
    topic.sourceRefs.some((ref) => ref.documentId === documentId && ref.page === page),
  );
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.level - a.level)[0] ?? null;
}
