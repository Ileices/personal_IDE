export const config = {
  ollamaApiEndpoint: process.env.OLLAMA_API_ENDPOINT || 'http://localhost:11434',
  nano: {
    baseUrl: process.env.NANO_BASE_URL || 'http://127.0.0.1:5100',
  api: {
    files: {
      write: '/api/files/write',
    },
  },
  },
};
