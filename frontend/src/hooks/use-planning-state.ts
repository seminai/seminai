import { useReducer, useCallback } from 'react';
import type {
  ManualPlanRow,
  AutoPlanConfig,
  PlanningProduct,
  PlanningProductionUnitOption,
} from '@/types/planning';

export type PlanningStep = 'company' | 'configure';

export interface PlanningState {
  readonly step: PlanningStep;
  readonly companyId: string | null;
  readonly companyName: string | null;
  readonly productionUnitIds: readonly string[];
  readonly productionUnitOptions: readonly PlanningProductionUnitOption[];
  readonly manualRows: readonly ManualPlanRow[];
  readonly autoProducts: readonly PlanningProduct[];
  readonly autoConfig: AutoPlanConfig;
  readonly operationCode: string | null;
}

type PlanningAction =
  | { readonly type: 'SET_COMPANY'; readonly companyId: string; readonly companyName: string }
  | { readonly type: 'SET_PRODUCTION_UNITS'; readonly ids: readonly string[] }
  | {
      readonly type: 'SET_PRODUCTION_UNIT_OPTIONS';
      readonly options: readonly PlanningProductionUnitOption[];
    }
  | { readonly type: 'NEXT_STEP' }
  | { readonly type: 'PREV_STEP' }
  | { readonly type: 'ADD_MANUAL_ROWS'; readonly rows: readonly ManualPlanRow[] }
  | { readonly type: 'UPDATE_MANUAL_ROW'; readonly id: string; readonly updates: Partial<ManualPlanRow> }
  | { readonly type: 'REMOVE_MANUAL_ROW'; readonly id: string }
  | { readonly type: 'SET_AUTO_PRODUCTS'; readonly products: readonly PlanningProduct[] }
  | { readonly type: 'ADD_AUTO_PRODUCTS'; readonly products: readonly PlanningProduct[] }
  | { readonly type: 'REMOVE_AUTO_PRODUCT'; readonly index: number }
  | { readonly type: 'SET_AUTO_CONFIG'; readonly config: Partial<AutoPlanConfig> }
  | { readonly type: 'SET_OPERATION_CODE'; readonly code: string | null }
  | { readonly type: 'RESET' };

const DEFAULT_AUTO_CONFIG: AutoPlanConfig = {
  orchestrator: { objective: 'balanced' },
  outStockLimiter: false,
  startAt: '',
  endAt: '',
  machines: [],
  operators: [],
};

const INITIAL_STATE: PlanningState = {
  step: 'company',
  companyId: null,
  companyName: null,
  productionUnitIds: [],
  productionUnitOptions: [],
  manualRows: [],
  autoProducts: [],
  autoConfig: DEFAULT_AUTO_CONFIG,
  operationCode: null,
};

function planningReducer(state: PlanningState, action: PlanningAction): PlanningState {
  switch (action.type) {
    case 'SET_COMPANY':
      return {
        ...INITIAL_STATE,
        companyId: action.companyId,
        companyName: action.companyName,
        step: state.step,
      };
    case 'SET_PRODUCTION_UNITS':
      return { ...state, productionUnitIds: action.ids };
    case 'SET_PRODUCTION_UNIT_OPTIONS':
      return { ...state, productionUnitOptions: action.options };
    case 'NEXT_STEP':
      if (state.step === 'company') return { ...state, step: 'configure' };
      return state;
    case 'PREV_STEP':
      if (state.step === 'configure') return { ...state, step: 'company' };
      return state;
    case 'ADD_MANUAL_ROWS':
      return { ...state, manualRows: [...state.manualRows, ...action.rows] };
    case 'UPDATE_MANUAL_ROW':
      return {
        ...state,
        manualRows: state.manualRows.map((r) =>
          r.id === action.id ? { ...r, ...action.updates } : r,
        ),
      };
    case 'REMOVE_MANUAL_ROW':
      return { ...state, manualRows: state.manualRows.filter((r) => r.id !== action.id) };
    case 'SET_AUTO_PRODUCTS':
      return { ...state, autoProducts: action.products };
    case 'ADD_AUTO_PRODUCTS':
      return { ...state, autoProducts: [...state.autoProducts, ...action.products] };
    case 'REMOVE_AUTO_PRODUCT':
      return { ...state, autoProducts: state.autoProducts.filter((_, i) => i !== action.index) };
    case 'SET_AUTO_CONFIG':
      return { ...state, autoConfig: { ...state.autoConfig, ...action.config } };
    case 'SET_OPERATION_CODE':
      return { ...state, operationCode: action.code };
    case 'RESET':
      return INITIAL_STATE;
  }
}

export function usePlanningState() {
  const [state, dispatch] = useReducer(planningReducer, INITIAL_STATE);

  const setCompany = useCallback(
    (companyId: string, companyName: string) =>
      dispatch({ type: 'SET_COMPANY', companyId, companyName }),
    [],
  );
  const setProductionUnits = useCallback(
    (ids: readonly string[]) => dispatch({ type: 'SET_PRODUCTION_UNITS', ids }),
    [],
  );
  const setProductionUnitOptions = useCallback(
    (options: readonly PlanningProductionUnitOption[]) =>
      dispatch({ type: 'SET_PRODUCTION_UNIT_OPTIONS', options }),
    [],
  );
  const nextStep = useCallback(() => dispatch({ type: 'NEXT_STEP' }), []);
  const prevStep = useCallback(() => dispatch({ type: 'PREV_STEP' }), []);
  const addManualRows = useCallback(
    (rows: readonly ManualPlanRow[]) => dispatch({ type: 'ADD_MANUAL_ROWS', rows }),
    [],
  );
  const updateManualRow = useCallback(
    (id: string, updates: Partial<ManualPlanRow>) =>
      dispatch({ type: 'UPDATE_MANUAL_ROW', id, updates }),
    [],
  );
  const removeManualRow = useCallback(
    (id: string) => dispatch({ type: 'REMOVE_MANUAL_ROW', id }),
    [],
  );
  const setAutoProducts = useCallback(
    (products: readonly PlanningProduct[]) =>
      dispatch({ type: 'SET_AUTO_PRODUCTS', products }),
    [],
  );
  const addAutoProducts = useCallback(
    (products: readonly PlanningProduct[]) =>
      dispatch({ type: 'ADD_AUTO_PRODUCTS', products }),
    [],
  );
  const removeAutoProduct = useCallback(
    (index: number) => dispatch({ type: 'REMOVE_AUTO_PRODUCT', index }),
    [],
  );
  const setAutoConfig = useCallback(
    (config: Partial<AutoPlanConfig>) => dispatch({ type: 'SET_AUTO_CONFIG', config }),
    [],
  );
  const setOperationCode = useCallback(
    (code: string | null) => dispatch({ type: 'SET_OPERATION_CODE', code }),
    [],
  );
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return {
    state,
    setCompany,
    setProductionUnits,
    setProductionUnitOptions,
    nextStep,
    prevStep,
    addManualRows,
    updateManualRow,
    removeManualRow,
    setAutoProducts,
    addAutoProducts,
    removeAutoProduct,
    setAutoConfig,
    setOperationCode,
    reset,
  } as const;
}
