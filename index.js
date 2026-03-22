* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-2.0-flash
Please retry in 31.913233941s. [{"@type":"type.googleapis.com/google.rpc.Help","links":[{"description":"Learn more about Gemini API quotas","url":"https://ai.google.dev/gemini-api/docs/rate-limits"}]},{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_input_token_count","quotaId":"GenerateContentInputTokensPerModelPerMinute-FreeTier","quotaDimensions":{"location":"global","model":"gemini-2.0-flash"}},{"quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier","quotaDimensions":{"location":"global","model":"gemini-2.0-flash"}},{"quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","quotaDimensions":{"location":"global","model":"gemini-2.0-flash"}}]},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"31s"}]
GoogleGenerativeAIFetchError: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent: [429 Too Many Requests] You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. 
* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count, limit: 0, model: gemini-2.0-flash
* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-2.0-flash
    at async ChatSession.sendMessage (/app/node_modules/@google/generative-ai/dist/index.js:1146:9)
  errorDetails: [
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async askZara (/app/index.js:117:18)
    { '@type': 'type.googleapis.com/google.rpc.Help', links: [Array] },
    at async makeRequest (/app/node_modules/@google/generative-ai/dist/index.js:387:9)
    at handleResponseNotOk (/app/node_modules/@google/generative-ai/dist/index.js:414:11)
    at async Client.<anonymous> (/app/index.js:231:19) {
    {
    {
    at async generateContent (/app/node_modules/@google/generative-ai/dist/index.js:832:22)
  status: 429,
      '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      '@type': 'type.googleapis.com/google.rpc.RetryInfo',
  statusText: 'Too Many Requests',
      violations: [Array]
      retryDelay: '31s'
    },
    }
  ]
