import { ToolCategory, buildToolsForBundle, resolveToolBundle } from '../graph/tool-registry';

const baseCfg = {
  threadId: 'thread-1',
  chatId: 'chat-1',
  userId: 'user-1',
  jobId: 'job-1',
  workspaceId: 'workspace-1',
  userInfo: { name: 'Tester', email: 'tester@example.com' },
};

describe('resolveToolBundle', () => {
  it('returns DOSAGE when jobId is present', () => {
    expect(resolveToolBundle({ jobId: 'job-1' })).toBe('DOSAGE');
  });

  it('returns FULL when jobId is absent', () => {
    expect(resolveToolBundle({})).toBe('FULL');
  });

  it('respects explicit forcedBundle override', () => {
    expect(resolveToolBundle({ jobId: 'job-1', forcedBundle: 'FULL' })).toBe('FULL');
    expect(resolveToolBundle({ forcedBundle: 'DOSAGE' })).toBe('DOSAGE');
  });
});

describe('buildToolsForBundle', () => {
  it('FULL exposes every category', () => {
    const result = buildToolsForBundle('FULL', baseCfg);
    expect(result.bundle).toBe('FULL');
    // FULL must include weather, field_notes, entity_management when their guards pass
    expect(result.toolsByCategory.has(ToolCategory.WEATHER)).toBe(true);
    expect(result.toolsByCategory.has(ToolCategory.FIELD_NOTES)).toBe(true);
    expect(result.toolsByCategory.has(ToolCategory.ENTITY_MANAGEMENT)).toBe(true);
  });

  it('DOSAGE drops weather, form_editor, field_notes, entity_management', () => {
    const result = buildToolsForBundle('DOSAGE', baseCfg);
    expect(result.bundle).toBe('DOSAGE');
    expect(result.toolsByCategory.has(ToolCategory.WEATHER)).toBe(false);
    expect(result.toolsByCategory.has(ToolCategory.FORM_EDITOR)).toBe(false);
    expect(result.toolsByCategory.has(ToolCategory.FIELD_NOTES)).toBe(false);
    expect(result.toolsByCategory.has(ToolCategory.ENTITY_MANAGEMENT)).toBe(false);
  });

  it('DOSAGE keeps the core dosage-planning categories', () => {
    const result = buildToolsForBundle('DOSAGE', baseCfg);
    expect(result.toolsByCategory.has(ToolCategory.DOSAGE_PIPELINE)).toBe(true);
    expect(result.toolsByCategory.has(ToolCategory.PLANNING)).toBe(true);
    expect(result.toolsByCategory.has(ToolCategory.SEARCH)).toBe(true);
    expect(result.toolsByCategory.has(ToolCategory.CONTEXT_DISCOVERY)).toBe(true);
    expect(result.toolsByCategory.has(ToolCategory.STOCK)).toBe(true);
    expect(result.toolsByCategory.has(ToolCategory.WORKSPACE_RULES)).toBe(true);
  });

  it('exposes effective company rules in the dosage workspace-rule tools', () => {
    const result = buildToolsForBundle('DOSAGE', baseCfg);
    const toolNames = result.toolsByCategory
      .get(ToolCategory.WORKSPACE_RULES)
      ?.map((tool) => tool.name);

    expect(toolNames).toContain('list_effective_company_rules');
  });

  it('DOSAGE has strictly fewer tools than FULL on the same config', () => {
    const full = buildToolsForBundle('FULL', baseCfg);
    const dosage = buildToolsForBundle('DOSAGE', baseCfg);
    expect(dosage.tools.length).toBeLessThan(full.tools.length);
  });

  it('DOSAGE turns off flags for categories it excludes', () => {
    // Weather/form_editor/field_notes are not gated by ToolFlags, so the
    // direct check is on category presence above. ToolFlags must still
    // reflect that contextDiscovery is kept (it is in DOSAGE) and that
    // jobManagement is kept when the input wiring allows it.
    const result = buildToolsForBundle('DOSAGE', baseCfg);
    expect(result.flags.hasContextDiscovery).toBe(true);
  });
});

describe('buildToolsForBundle — MANUFACTURING', () => {
  // Manufacturing chat has no jobId; bundle is forced explicitly.
  const mfgCfg = {
    threadId: 'thread-mfg',
    chatId: 'chat-mfg',
    userId: 'user-mfg',
    workspaceId: 'workspace-mfg',
    userInfo: { name: 'Tester', email: 'tester@example.com' },
  };

  const ALLOWED = [
    'list_user_companies',
    'list_company_products',
    'get_working_memory_details',
    'ask_user_questions',
    'extract_from_file',
    'present_extraction_review',
    'import_stock_from_file',
    'check_extraction_status',
    'search_company_stock_products',
  ];

  const EXCLUDED = [
    'import_from_file',
    'list_production_units',
    'normalize_extraction',
    'check_product_crop_authorizations',
    'schedule_alert',
    'create_company',
    'create_fields',
    'search_products',
    'calculate_dosage',
    'validate_compliance',
    'create_treatment_jobs',
    'delegate_to_field_note',
    'generate_treatment_plan',
    'start_dosage_agent_job',
    'spawn_subagent',
    'get_weather_forecast',
    'create_sales_order',
    'generate_ddt',
  ];

  it('resolveToolBundle respects an explicit MANUFACTURING override', () => {
    expect(resolveToolBundle({ forcedBundle: 'MANUFACTURING' })).toBe('MANUFACTURING');
  });

  it('exposes EXACTLY the manufacturing tool allowlist', () => {
    const result = buildToolsForBundle('MANUFACTURING', mfgCfg);
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual([...ALLOWED].sort());
  });

  it('exposes NONE of the agronomic / excluded tools', () => {
    const result = buildToolsForBundle('MANUFACTURING', mfgCfg);
    const names = new Set(result.tools.map((t) => t.name));
    for (const excluded of EXCLUDED) {
      expect(names.has(excluded)).toBe(false);
    }
  });

  it('keeps only the three source categories and drops agronomic ones', () => {
    const result = buildToolsForBundle('MANUFACTURING', mfgCfg);
    expect(result.toolsByCategory.has(ToolCategory.CONTEXT_DISCOVERY)).toBe(true);
    expect(result.toolsByCategory.has(ToolCategory.ENTITY_MANAGEMENT)).toBe(true);
    expect(result.toolsByCategory.has(ToolCategory.STOCK)).toBe(true);
    expect(result.toolsByCategory.has(ToolCategory.DOSAGE_PIPELINE)).toBe(false);
    expect(result.toolsByCategory.has(ToolCategory.PLANNING)).toBe(false);
    expect(result.toolsByCategory.has(ToolCategory.SEARCH)).toBe(false);
    expect(result.toolsByCategory.has(ToolCategory.SALES)).toBe(false);
    expect(result.toolsByCategory.has(ToolCategory.WEATHER)).toBe(false);
    expect(result.toolsByCategory.has(ToolCategory.WORKSPACE_RULES)).toBe(false);
  });

  it('turns off agronomic capability flags but keeps context discovery', () => {
    const result = buildToolsForBundle('MANUFACTURING', mfgCfg);
    expect(result.flags.hasContextDiscovery).toBe(true);
    expect(result.flags.hasBdfTools).toBe(false);
    expect(result.flags.hasConformityCheck).toBe(false);
    expect(result.flags.hasJobManagement).toBe(false);
    expect(result.flags.hasRulesSearch).toBe(false);
  });
});
