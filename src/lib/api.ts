import type {
  AppConfig,
  AppSettings,
  ChatMessage,
  Course,
  DocumentDto,
  ModelConfig,
  Outline,
  PageText,
  Topic,
} from '../types';

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiClientError('NETWORK_ERROR', 0, 'Network request failed.');
  }
  if (response.status === 204) return undefined as T;
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; field?: string } } | null)
      ?.error;
    throw new ApiClientError(
      error?.code ?? 'INTERNAL',
      response.status,
      error?.message ?? 'Request failed.',
      error?.field,
    );
  }
  return payload as T;
}

export const api = {
  async listCourses(): Promise<Course[]> {
    return (await request<{ courses: Course[] }>('/api/courses')).courses;
  },
  async createCourse(name: string, color?: string): Promise<Course> {
    return (
      await request<{ course: Course }>('/api/courses', {
        method: 'POST',
        body: JSON.stringify({ name, color }),
      })
    ).course;
  },
  async updateCourse(id: string, input: { name?: string; color?: string }): Promise<Course> {
    return (
      await request<{ course: Course }>(`/api/courses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      })
    ).course;
  },
  async deleteCourse(id: string): Promise<void> {
    await request<void>(`/api/courses/${id}`, { method: 'DELETE' });
  },
  async getOutline(courseId: string): Promise<Outline> {
    return request<Outline>(`/api/courses/${courseId}/outline`);
  },
  async listDocuments(courseId: string): Promise<DocumentDto[]> {
    return (await request<{ documents: DocumentDto[] }>(`/api/courses/${courseId}/documents`))
      .documents;
  },
  async deleteDocument(id: string): Promise<void> {
    await request<void>(`/api/documents/${id}`, { method: 'DELETE' });
  },
  async retryDocument(id: string): Promise<void> {
    await request<{ document: DocumentDto }>(`/api/documents/${id}/retry`, { method: 'POST' });
  },
  async updateLecture(lectureId: string, title: string): Promise<void> {
    await request(`/api/lectures/${lectureId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  },
  async regenerateOutline(
    courseId: string,
    lectureId: string,
    options: {
      mode: 'ai' | 'local';
      modelId?: string | null;
      preserveManualEdits: boolean;
    },
  ): Promise<void> {
    await request(`/api/courses/${courseId}/lectures/${lectureId}/outline/regenerate`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },
  async updateTopic(
    topicId: string,
    input: {
      title?: string;
      summaryEn?: string;
      summaryZh?: string;
      keywords?: string[];
    },
  ): Promise<Topic> {
    return (
      await request<{ topic: Topic }>(`/api/topics/${topicId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      })
    ).topic;
  },
  async mergeTopic(topicId: string, title?: string): Promise<Topic> {
    return (
      await request<{ topic: Topic }>(`/api/topics/${topicId}/merge-next`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      })
    ).topic;
  },
  async splitTopic(
    topicId: string,
    input: { title: string; keptSourceRefs: number },
  ): Promise<void> {
    await request(`/api/topics/${topicId}/split`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async getPage(documentId: string, page: number): Promise<PageText> {
    return request<PageText>(`/api/documents/${documentId}/pages/${page}`);
  },
  async listModels(): Promise<ModelConfig[]> {
    return (await request<{ models: ModelConfig[] }>('/api/models')).models;
  },
  async createModel(input: {
    displayName: string;
    provider: 'deepseek' | 'openai-compatible';
    baseUrl: string;
    modelId: string;
    apiKey: string;
  }): Promise<ModelConfig> {
    return (
      await request<{ model: ModelConfig }>('/api/models', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    ).model;
  },
  async deleteModel(id: string): Promise<void> {
    await request<void>(`/api/models/${id}`, { method: 'DELETE' });
  },
  async listChat(courseId: string): Promise<ChatMessage[]> {
    return (await request<{ messages: ChatMessage[] }>(`/api/courses/${courseId}/chat`)).messages;
  },
  async sendChat(input: {
    courseId: string;
    modelId: string;
    question: string;
    lectureId?: string;
  }): Promise<ChatMessage> {
    return (
      await request<{ message: ChatMessage }>('/api/chat', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    ).message;
  },
  async setFeedback(messageId: string, feedback: 'up' | 'down' | null): Promise<ChatMessage> {
    return (
      await request<{ message: ChatMessage }>(`/api/chat/${messageId}/feedback`, {
        method: 'PATCH',
        body: JSON.stringify({ feedback }),
      })
    ).message;
  },
  async clearChat(courseId: string): Promise<void> {
    await request<void>(`/api/courses/${courseId}/chat`, { method: 'DELETE' });
  },
  async getSettings(): Promise<AppSettings> {
    return request<AppSettings>('/api/settings');
  },
  async updateSettings(
    input: Partial<Pick<AppSettings, 'highThreshold' | 'allowModelFallback' | 'enableWebSearch'>>,
  ): Promise<AppSettings> {
    return request<AppSettings>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
  async getConfig(): Promise<AppConfig> {
    return request<AppConfig>('/api/config');
  },
};

export function uploadPdfs(
  courseId: string,
  files: File[],
  onProgress: (percent: number) => void,
  outlineModelId?: string | null,
): Promise<DocumentDto[]> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    for (const file of files) formData.append('files', file);
    if (outlineModelId) formData.append('outlineModelId', outlineModelId);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/courses/${courseId}/documents`);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onerror = () => reject(new ApiClientError('NETWORK_ERROR', 0, 'Upload failed.'));
    xhr.onload = () => {
      const payload = xhr.response as
        | { documents?: DocumentDto[]; error?: { code?: string; message?: string } }
        | null;
      if (xhr.status >= 200 && xhr.status < 300 && payload?.documents) {
        resolve(payload.documents);
        return;
      }
      reject(
        new ApiClientError(
          payload?.error?.code ?? 'INTERNAL',
          xhr.status,
          payload?.error?.message ?? 'Upload failed.',
        ),
      );
    };
    xhr.send(formData);
  });
}
