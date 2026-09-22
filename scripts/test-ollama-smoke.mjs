const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const model = process.env.SEMINAI_TEST_LLM_MODEL?.trim() || 'qwen3.5:4b';

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`Ollama ${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

const tags = await request('/api/tags');
const installedModels = Array.isArray(tags.models)
  ? tags.models.map((entry) => entry?.name).filter((name) => typeof name === 'string')
  : [];

if (!installedModels.includes(model)) {
  throw new Error(`Required local Ollama model is not installed: ${model}`);
}

const result = await request('/api/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    model,
    stream: false,
    think: false,
    options: { temperature: 0 },
    messages: [
      {
        role: 'system',
        content: 'Always call get_plot_status. Do not answer directly.',
      },
      {
        role: 'user',
        content: 'Check the synthetic plot with id plot-test-001.',
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'get_plot_status',
          description: 'Read the status of a synthetic test plot.',
          parameters: {
            type: 'object',
            properties: { plotId: { type: 'string' } },
            required: ['plotId'],
          },
        },
      },
    ],
  }),
});

const toolCalls = result?.message?.tool_calls;
if (!Array.isArray(toolCalls) || toolCalls[0]?.function?.name !== 'get_plot_status') {
  throw new Error(`Ollama model ${model} did not produce the expected tool call`);
}

const plotId = toolCalls[0]?.function?.arguments?.plotId;
if (plotId !== 'plot-test-001') {
  throw new Error(`Ollama model ${model} returned an unexpected synthetic plot id`);
}

console.log(`Ollama smoke passed: ${model}, tool calling, zero remote-provider cost.`);

const optionalModels = ['qwen3.5:9b', 'llama3.1:8b'];
const presentOptional = optionalModels.filter((name) =>
  installedModels.some((installed) => installed === name || installed.startsWith(`${name}-`)),
);
const visionPresent = installedModels.some((name) => /vision|llava|minicpm-v/i.test(name));
if (presentOptional.length || visionPresent) {
  console.log(
    `Optional local models present: ${[...presentOptional, visionPresent ? 'vision' : ''].filter(Boolean).join(', ')}`,
  );
} else {
  console.log('Optional models qwen3.5:9b / llama3.1:8b / vision are not installed; skipped.');
}
