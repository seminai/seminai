// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OperationForm } from './farm/operation-form';
import { SettingsAiPanel } from './settings-ai-panel';

const { propose, request } = vi.hoisted(() => ({ propose: vi.fn(), request: vi.fn() }));
vi.mock('@/hooks/use-farm', () => ({
  useCompleteFarmCatalog: () => ({
    data: [{ id: 'synthetic-product', name: 'Test product', warehouse: { name: 'Test store' } }],
  }),
  useProposeOperation: () => ({ mutate: propose }),
  useReviseOperation: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/services/farm-api', () => ({ farmRequest: request }));

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
});
async function render(node: ReactNode) {
  await act(async () =>
    root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>),
  );
}
function element<T extends HTMLElement>(selector: string): T {
  const found = container.querySelector<T>(selector);
  if (!found) throw new Error(`Missing ${selector}`);
  return found;
}
async function fill(selector: string, value: string) {
  await act(async () => {
    const input = element<HTMLInputElement>(selector);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function clickButton(text: string) {
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.textContent === text,
  );
  if (!button) throw new Error(`Missing button ${text}`);
  await act(async () => button.click());
}

it('submits a manual movement by clicking the visible review button', async () => {
  await render(<OperationForm companyId="synthetic-company" mode="IN" onDone={() => {}} />);
  await fill('input[aria-label="Causale"]', 'Synthetic purchase');
  await fill('input[aria-label="Quantità 1"]', '10');
  await act(async () => {
    const select = element<HTMLSelectElement>('select[aria-label="Prodotto 1"]');
    select.value = 'synthetic-product';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await clickButton('Controlla riepilogo');
  expect(propose).toHaveBeenCalledOnce();
  expect(propose).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: expect.objectContaining({
        reason: 'Synthetic purchase',
        movements: [
          expect.objectContaining({ productId: 'synthetic-product', quantity: 10, type: 'IN' }),
        ],
      }),
    }),
    expect.any(Object),
  );
});

it('loads the administrative AI endpoint and preserves the user activation choice when saving', async () => {
  request.mockResolvedValue({
    enabled: false,
    provider: 'ollama',
    model: '',
    baseUrl: 'http://127.0.0.1:11434',
    hasApiKey: false,
    visionModel: '',
    audioModel: '',
    embeddingModel: '',
    capabilities: { enabled: false, chat: false, vision: false, audio: false, embeddings: false },
  });
  await render(<SettingsAiPanel />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(request).toHaveBeenCalledWith('/settings/ai');
  await act(async () => element<HTMLInputElement>('input[type="checkbox"]').click());
  await fill('input[placeholder="Identificativo del modello"]', 'synthetic-chat-model');
  await clickButton('Salva configurazione');
  expect(request).toHaveBeenCalledWith(
    '/settings/ai',
    'PUT',
    expect.objectContaining({
      enabled: true,
      model: 'synthetic-chat-model',
      vision: false,
      audio: false,
      embeddings: false,
    }),
  );
});
