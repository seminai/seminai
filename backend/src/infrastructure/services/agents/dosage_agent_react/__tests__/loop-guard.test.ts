import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { Label } from '../../../../../domain/dtos/label.dto';
import { createGuardNode } from '../graph/nodes';
import { createToolCallRecord } from '../graph/tool-call-record';
import { LoopDetector } from '../loop-detector';
import type { DosageReactState } from '../type/state';
import { _resetWorkingMemoryForTesting, updateWorkingMemory } from '../working-memory';

function buildMetripharLabel(): Label {
  return {
    prodotto: 'METRIPHAR 70 WG',
    categoria: 'Erbicida selettivo',
    principio_attivo: 'Metribuzin',
    composizione: 'Metribuzin 70%',
    meccanismo_azione_frac: null,
    malattie: [],
    specie: [],
    colture_target: ['Patata'],
    dosaggi_dettagliati: [
      {
        coltura: 'Patata',
        dose_minima: 250,
        dose_massima: 400,
        dose_um: 'g/ha',
        epoca_impiego: 'pre-emergenza',
        intervallo_sicurezza_giorni: 60,
      },
      {
        coltura: 'Patata',
        dose_minima: 250,
        dose_massima: 300,
        dose_um: 'g/ha',
        epoca_impiego: 'post-emergenza',
        intervallo_sicurezza_giorni: 60,
      },
    ],
    fasce_di_rispetto_e_deriva: [],
    fasce_rispetto_acqua: null,
    fasce_rispetto_colture: null,
    avvertenze: ['Non trattare su terreni sabbiosi.'],
    frasi_pericolo: ['H410'],
    frasi_prudenza: [],
    compatibilita: null,
    fitotossicita: null,
    note_tecniche: null,
    extraction_confidence: 95,
    extracted_fields: [],
    errors: [],
  };
}

describe('createGuardNode loop hard-stop', () => {
  afterEach(() => {
    _resetWorkingMemoryForTesting();
  });

  it('updates name and structured histories before executing a normal tool call', async () => {
    const aiMessage = new AIMessage({ content: '' });
    (
      aiMessage as AIMessage & {
        tool_calls: Array<{ name: string; args: Record<string, unknown>; id: string }>;
      }
    ).tool_calls = [{ name: 'search_products', args: { cropName: 'vite' }, id: 'tc-ok' }];
    const state: DosageReactState = {
      messages: [aiMessage],
      loopCounter: 0,
      lastToolCalls: [],
      taskList: [],
    };

    const result = await createGuardNode(new LoopDetector())(state);

    expect(result.loopCounter).toBe(1);
    expect(result.lastToolCalls).toEqual(['search_products']);
    expect(result.lastToolCallRecords).toHaveLength(1);
    expect(result.lastToolCallRecords?.[0].name).toBe('search_products');
    expect(result.lastToolCallRecords?.[0].argsHash).toEqual(expect.any(String));
  });

  it('cancels the pending tool call and emits a final message on identical tool patterns', async () => {
    const aiMessage = new AIMessage({ content: '' });
    (
      aiMessage as AIMessage & {
        tool_calls: Array<{ name: string; args: Record<string, unknown>; id: string }>;
      }
    ).tool_calls = [{ name: 'search_products', args: {}, id: 'tc-loop' }];

    const repeatedRecord = createToolCallRecord({ name: 'search_products', args: {} });
    const state: DosageReactState = {
      messages: [aiMessage],
      loopCounter: 2,
      lastToolCalls: ['search_products', 'search_products'],
      lastToolCallRecords: [repeatedRecord, repeatedRecord],
      taskList: [],
    };

    const result = await createGuardNode(new LoopDetector())(state);

    expect(result.loopCounter).toBe(3);
    expect(result.lastToolCalls).toEqual(['search_products', 'search_products', 'search_products']);
    expect(result.lastToolCallRecords).toHaveLength(3);
    expect(result.pendingAction).toBeNull();
    expect(result.messages).toHaveLength(2);
    expect(result.messages?.[0]).toBeInstanceOf(ToolMessage);
    expect((result.messages?.[0] as ToolMessage).tool_call_id).toBe('tc-loop');
    expect((result.messages?.[0] as ToolMessage).name).toBe('search_products');
    expect(String(result.messages?.[0].content)).toContain('"loopDetected":true');
    expect(result.messages?.[1]).toBeInstanceOf(AIMessage);
    expect(String(result.messages?.[1].content)).toContain('Mi sono fermato');
  });

  it('answers from label facts instead of technical loop wording when dosage repeats', async () => {
    const threadId = 'thread-metriphar-loop';
    updateWorkingMemory(threadId, {
      labelCache: {
        '10577': {
          productName: 'METRIPHAR 70 WG',
          registrationNumber: '10577',
          label: buildMetripharLabel(),
        },
      },
    });
    const aiMessage = new AIMessage({ content: '' });
    (
      aiMessage as AIMessage & {
        tool_calls: Array<{ name: string; args: Record<string, unknown>; id: string }>;
      }
    ).tool_calls = [
      {
        name: 'calculate_dosage',
        args: { strategy: 'avg', outStockLimiter: false },
        id: 'tc-dosage-loop',
      },
    ];
    const repeatedRecord = createToolCallRecord({
      name: 'calculate_dosage',
      args: { strategy: 'avg', outStockLimiter: false },
    });
    const state: DosageReactState = {
      messages: [
        new HumanMessage('hai informazioni su fasce di rispetto di metriphar su patata?'),
        aiMessage,
      ],
      loopCounter: 2,
      lastToolCalls: ['calculate_dosage', 'calculate_dosage'],
      lastToolCallRecords: [repeatedRecord, repeatedRecord],
      taskList: [],
    };

    const result = await createGuardNode(new LoopDetector(), { threadId })(state);

    const finalContent = String(result.messages?.[1].content);
    expect(finalContent).toContain('250-400 g/ha');
    expect(finalContent).toContain('250-300 g/ha');
    expect(finalContent).toContain('Nessuna fascia');
    expect(finalContent).not.toContain('Mi sono fermato');
    expect(finalContent).not.toContain('ciclo tecnico');
  });
});
