// Models used across the lab. Browse the catalog with `npx wrangler ai models list`.
export const MODELS = {
  text: "@cf/meta/llama-3.1-8b-instruct-fp8",
  embedding: "@cf/baai/bge-base-en-v1.5", // 768 dimensions, matching the Vectorize index
  classify: "@cf/microsoft/resnet-50",
  image: "@cf/black-forest-labs/flux-1-schnell",
} as const;

// AI Gateway: routes AI calls through a gateway for logs, analytics, caching
// and rate limits. A gateway named "default" is created on first use.
export const GATEWAY_ID = "default";
