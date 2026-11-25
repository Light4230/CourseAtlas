declare module 'pdfjs-dist/legacy/build/pdf.js' {
  export const getDocument: (options: Record<string, unknown>) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getTextContent: () => Promise<{ items: Array<Record<string, unknown>> }>;
      }>;
      destroy: () => Promise<void>;
    }>;
  };
  export const VerbosityLevel: { ERRORS: number };
}
