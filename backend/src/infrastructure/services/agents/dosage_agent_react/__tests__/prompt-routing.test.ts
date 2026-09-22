import { buildAgentsPrompt } from '../prompt/agents-prompt.builder';
import { buildLabelQueryPrompt } from '../prompt/label-query-prompt.builder';
import type { SystemPromptOptions } from '../prompt/system-prompt';

const OPTIONS: SystemPromptOptions = {
  hasRulesSearch: false,
  hasJobOperationsSearch: false,
  hasDisciplinariPdf: false,
  hasBdfTools: false,
  hasTavilySearch: false,
  hasJobModification: false,
  hasContextDiscovery: true,
  hasPlanning: true,
  hasFieldNoteDelegation: false,
  hasProductLabelDb: false,
  hasEntityCreation: false,
  hasConformityCheck: false,
  hasJobManagement: false,
};

describe('dosage agent prompt routing', () => {
  it('distinguishes quick draft from accurate dosage planning', () => {
    const prompt = buildAgentsPrompt(OPTIONS);

    expect(prompt).toContain('BOZZA RAPIDA');
    expect(prompt).toContain('CALCOLO ACCURATO');
    expect(prompt).toContain('Preferisci una bozza rapida in chat');
    expect(prompt).toContain('Questa è una bozza rapida in chat');
    expect(prompt).toContain('chiama direttamente calculate_dosage');
    expect(prompt).toContain('NON costruire manualmente la catena inline');
  });

  it('lists start_dosage_agent_job as an approval-gated tool', () => {
    const prompt = buildAgentsPrompt(OPTIONS);

    expect(prompt).toContain('Tool che RICHIEDONO APPROVAZIONE esplicita');
    expect(prompt).toContain('start_dosage_agent_job, create_treatment_jobs');
  });

  it('forbids leaking technical identifiers in user-facing output', () => {
    const prompt = buildAgentsPrompt(OPTIONS);

    expect(prompt).toContain('IDENTIFICATIVI TECNICI');
    expect(prompt).toContain('NON mostrare mai in chat ID tecnici');
  });

  it('routes operation history requests to the unified operations history tools', () => {
    const prompt = buildAgentsPrompt({ ...OPTIONS, hasFieldNoteDelegation: true });

    expect(prompt).toContain('STORICO OPERAZIONI');
    expect(prompt).toContain('chiama list_done_operations');
    expect(prompt).toContain('Operazioni verificate in Archivio');
    expect(prompt).toContain('Operazioni registrate nelle note di campo');
    expect(prompt).toContain('chiama list_unverified_operations');
    expect(prompt).toContain('usa list_done_operations');
  });

  it('routes targeted label questions away from dosage planning tools', () => {
    const prompt = buildLabelQueryPrompt({ ...OPTIONS, hasProductLabelDb: true });

    expect(prompt).toContain('DOMANDE MIRATE DA ETICHETTA');
    expect(prompt).toContain('fasce di rispetto');
    expect(prompt).toContain('get_working_memory_details(key="labelCache")');
    expect(prompt).toContain('NON chiamare calculate_dosage');
    expect(prompt).toContain('pianificare trattamenti con date');
    expect(prompt).toContain('calculate_dosage/generate_treatment_plan');
  });
});
