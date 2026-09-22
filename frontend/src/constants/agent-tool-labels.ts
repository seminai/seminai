import type { LucideIcon } from 'lucide-react';
import {
  Search,
  ShieldCheck,
  BookOpen,
  Package,
  Factory,
  ClipboardList,
  CalendarRange,
  Wrench,
  Plus,
  Sparkles,
  ListChecks,
  FileSearch,
  FileUp,
  CheckCircle2,
  Building2,
  Map,
  ScrollText,
  Calculator,
  Beaker,
  Workflow,
  PlayCircle,
  Bell,
  HelpCircle,
} from 'lucide-react';

export interface ToolLabelDefinition {
  readonly labelIt: string;
  readonly icon: LucideIcon;
  readonly requiresApproval?: boolean;
}

export const AGENT_TOOL_LABELS = {
  // Search & lookup
  tavily_scientific_search: { labelIt: 'Sto cercando fonti ufficiali', icon: Search },
  search_disciplinari_pdf: { labelIt: 'Sto consultando i disciplinari', icon: BookOpen },
  search_disciplinari_database: { labelIt: 'Sto consultando i disciplinari', icon: BookOpen },
  search_rules: { labelIt: 'Sto consultando le regole aziendali', icon: FileSearch },
  search_job_operations: { labelIt: 'Sto cercando tra le operazioni', icon: ListChecks },
  search_product_label_database: { labelIt: 'Sto cercando il prodotto in etichetta', icon: FileSearch },
  bdf_search_product_doses: { labelIt: 'Sto cercando le dosi del prodotto', icon: Beaker },
  bdf_search_products_by_adversity: { labelIt: 'Sto cercando prodotti per avversità', icon: Search },

  // Authorizations & compliance
  check_product_crop_authorizations: { labelIt: 'Sto verificando le autorizzazioni del prodotto', icon: ShieldCheck },
  check_revoked: { labelIt: 'Sto verificando i prodotti revocati', icon: ShieldCheck },
  validate_compliance: { labelIt: 'Sto validando la conformità', icon: ShieldCheck },
  validate_sa_groups: { labelIt: 'Sto validando i gruppi sostanze attive', icon: ShieldCheck },
  check_compatibility: { labelIt: 'Sto verificando la compatibilità', icon: ShieldCheck },

  // Stock & inventory
  search_company_stock_products: { labelIt: 'Sto cercando in magazzino', icon: Package },
  search_company_stock: { labelIt: 'Sto cercando in magazzino', icon: Package },
  calculate_stock: { labelIt: 'Sto calcolando il magazzino', icon: Calculator },

  // Production units & fields
  list_production_units: { labelIt: 'Sto recuperando le unità produttive', icon: Factory },
  list_user_companies: { labelIt: 'Sto recuperando le aziende', icon: Building2 },
  list_user_fields: { labelIt: 'Sto recuperando i campi', icon: Map },
  list_company_products: { labelIt: 'Sto recuperando i prodotti aziendali', icon: Package },

  // Job management
  get_job_details: { labelIt: 'Sto leggendo i dettagli del job', icon: ClipboardList },
  list_existing_job_groups: { labelIt: 'Sto recuperando i gruppi di job', icon: ListChecks },
  merge_treatment_dates: { labelIt: 'Sto unendo le date dei trattamenti', icon: CalendarRange, requiresApproval: true },
  update_job: { labelIt: 'Sto aggiornando il job', icon: Wrench, requiresApproval: true },
  create_job: { labelIt: 'Sto creando un nuovo job', icon: Plus, requiresApproval: true },
  add_job: { labelIt: 'Sto creando un nuovo job', icon: Plus, requiresApproval: true },
  create_treatment_jobs: { labelIt: 'Sto creando i job di trattamento', icon: Plus, requiresApproval: true },
  optimize_selected_jobs: { labelIt: 'Sto ottimizzando i job selezionati', icon: Sparkles, requiresApproval: true },
  start_dosage_agent_job: { labelIt: 'Sto avviando l’agente di dosaggio', icon: PlayCircle, requiresApproval: true },

  // Dosage pipeline
  calculate_dosage: { labelIt: 'Sto calcolando il dosaggio', icon: Calculator },
  optimize_dosage: { labelIt: 'Sto ottimizzando il dosaggio', icon: Sparkles },
  plan_strategy: { labelIt: 'Sto pianificando la strategia', icon: Workflow },
  generate_plan: { labelIt: 'Sto generando il piano', icon: Workflow },
  modify_plan_step: { labelIt: 'Sto modificando uno step del piano', icon: Workflow },
  execute_plan: { labelIt: 'Sto eseguendo il piano', icon: PlayCircle },
  fertilizer_plan: { labelIt: 'Sto preparando il piano di concimazione', icon: Beaker },
  expand_cycles: { labelIt: 'Sto espandendo i cicli colturali', icon: CalendarRange },
  extract_buffer_zones: { labelIt: 'Sto estraendo le zone di rispetto', icon: Map },
  enrich_bdf: { labelIt: 'Sto arricchendo i dati BDF', icon: BookOpen },

  // Conformity
  run_conformity_check: { labelIt: 'Sto eseguendo il controllo di conformità', icon: ShieldCheck },
  confirm_conformity_check: { labelIt: 'Sto confermando il controllo di conformità', icon: CheckCircle2, requiresApproval: true },

  // Entities (high risk)
  create_company: { labelIt: 'Sto creando una nuova azienda', icon: Building2, requiresApproval: true },
  create_fields: { labelIt: 'Sto creando i campi', icon: Map, requiresApproval: true },
  create_production_units: { labelIt: 'Sto creando le unità produttive', icon: Factory, requiresApproval: true },
  update_production_units: { labelIt: 'Sto aggiornando le unità produttive', icon: Factory, requiresApproval: true },

  // Imports
  extract_from_file: { labelIt: 'Sto estraendo i dati dal file', icon: FileUp },
  check_extraction_status: { labelIt: 'Sto verificando lo stato dell’estrazione', icon: FileUp },
  import_from_file: { labelIt: 'Sto importando i dati dal file', icon: FileUp, requiresApproval: true },
  import_stock_from_file: { labelIt: 'Sto importando il magazzino', icon: FileUp, requiresApproval: true },

  // Field notes
  delegate_to_field_note: { labelIt: 'Sto delegando alla nota di campo', icon: ScrollText },
  approve_field_note: { labelIt: 'Sto approvando la nota di campo', icon: CheckCircle2, requiresApproval: true },
  reject_field_note: { labelIt: 'Sto rifiutando la nota di campo', icon: ScrollText },

  // Workspaces & rules
  list_user_workspaces: { labelIt: 'Sto recuperando i workspace', icon: ListChecks },
  list_workspace_rules: { labelIt: 'Sto recuperando le regole del workspace', icon: ScrollText },
  create_workspace_rule: { labelIt: 'Sto creando una regola del workspace', icon: Plus },
  update_workspace_rule: { labelIt: 'Sto aggiornando una regola del workspace', icon: Wrench },
  archive_workspace_rule: { labelIt: 'Sto archiviando una regola del workspace', icon: ScrollText, requiresApproval: true },

  // Memory & meta
  get_working_memory_details: { labelIt: 'Sto consultando la memoria di lavoro', icon: ListChecks },
  schedule_alert: { labelIt: 'Sto programmando un avviso', icon: Bell },
  ask_user_questions: { labelIt: 'Sto preparando alcune domande', icon: HelpCircle },
  plan_task: { labelIt: 'Sto pianificando l’attività', icon: Workflow },

  // Sales module (anagrafica, ordini, DDT)
  create_business_partner: { labelIt: 'Sto creando un cliente/fornitore', icon: Building2, requiresApproval: true },
  search_business_partners: { labelIt: 'Sto cercando tra clienti/fornitori', icon: Search },
  create_sales_order: { labelIt: 'Sto creando un ordine', icon: Plus, requiresApproval: true },
  confirm_sales_order: { labelIt: 'Sto confermando l’ordine', icon: CheckCircle2, requiresApproval: true },
  list_sales_orders: { labelIt: 'Sto recuperando gli ordini', icon: ListChecks },
  check_product_availability: { labelIt: 'Sto verificando la disponibilità', icon: Calculator },
  generate_proforma: { labelIt: 'Sto generando la proforma', icon: ScrollText, requiresApproval: true },
  generate_ddt: { labelIt: 'Sto generando il DDT', icon: ScrollText, requiresApproval: true },
  cancel_ddt: { labelIt: 'Sto annullando il DDT', icon: ScrollText, requiresApproval: true },
  get_ddt: { labelIt: 'Sto recuperando il DDT', icon: ScrollText },
  preview_order_template: { labelIt: 'Sto leggendo il modello ordine', icon: FileUp },
  import_sales_order_from_template: {
    labelIt: 'Sto importando l’ordine dal modello',
    icon: FileUp,
    requiresApproval: true,
  },
} as const satisfies Record<string, ToolLabelDefinition>;

export type AgentToolName = keyof typeof AGENT_TOOL_LABELS;

const FALLBACK_ICON: LucideIcon = Wrench;

export function resolveToolLabel(toolName: string): ToolLabelDefinition {
  if (toolName in AGENT_TOOL_LABELS) {
    return AGENT_TOOL_LABELS[toolName as AgentToolName];
  }
  return { labelIt: `Sto eseguendo ${toolName}`, icon: FALLBACK_ICON };
}
