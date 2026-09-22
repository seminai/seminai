import { DynamicStructuredTool } from '@langchain/core/tools';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** Maximum reasonable dose per hectare (kg/L). */
const MAX_DOSE_PER_HA = 500;
/** Maximum reasonable surface in hectares. */
const MAX_SURFACE_HA = 10_000;
/** How far in the past a date is considered invalid (ms). */
const MAX_PAST_DATE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Validation rules applied to tool arguments.
 */
interface ValidationError {
  readonly field: string;
  readonly message: string;
}

/**
 * Validates UUID fields (keys ending with Id or Ids).
 */
function validateUuidFields(args: Record<string, unknown>): readonly ValidationError[] {
  const errors: ValidationError[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (!key.endsWith('Id') && !key.endsWith('Ids')) continue;
    if (key.endsWith('Ids') && Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && !UUID_REGEX.test(item)) {
          errors.push({ field: key, message: `"${item}" non è un UUID valido in ${key}` });
        }
      }
    } else if (typeof value === 'string' && value.length > 0 && !UUID_REGEX.test(value)) {
      errors.push({ field: key, message: `"${value}" non è un UUID valido per ${key}` });
    }
  }
  return errors;
}

/**
 * Validates date-like string fields.
 */
function validateDateFields(args: Record<string, unknown>): readonly ValidationError[] {
  const errors: ValidationError[] = [];
  const now = Date.now();
  for (const [key, value] of Object.entries(args)) {
    if (typeof value !== 'string') continue;
    const isDateKey = /date|At$|start|end|scadenza/i.test(key);
    if (!isDateKey) continue;
    if (!ISO_DATE_REGEX.test(value)) {
      errors.push({ field: key, message: `"${value}" non è una data ISO 8601 valida per ${key}` });
      continue;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      errors.push({ field: key, message: `"${value}" non è una data valida per ${key}` });
      continue;
    }
    if (parsed.getTime() < now - MAX_PAST_DATE_MS) {
      errors.push({
        field: key,
        message: `${key} è troppo nel passato (${value}). Verifica la data.`,
      });
    }
  }
  return errors;
}

/**
 * Validates numeric fields for reasonable agronomic bounds.
 */
function validateNumericBounds(args: Record<string, unknown>): readonly ValidationError[] {
  const errors: ValidationError[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (typeof value !== 'number') continue;
    const isDose = /dose|dosePerHa|dose_ha|quantit/i.test(key);
    const isSurface = /surface|area|superficie|hectares/i.test(key);
    if (isDose && (value < 0 || value > MAX_DOSE_PER_HA)) {
      errors.push({
        field: key,
        message: `Dose ${value} fuori range (0-${MAX_DOSE_PER_HA} kg/ha) per ${key}`,
      });
    }
    if (isSurface && (value < 0 || value > MAX_SURFACE_HA)) {
      errors.push({
        field: key,
        message: `Superficie ${value} fuori range (0-${MAX_SURFACE_HA} ha) per ${key}`,
      });
    }
  }
  return errors;
}

/**
 * Runs all validation rules on tool arguments.
 */
function validateArguments(args: Record<string, unknown>): readonly ValidationError[] {
  return [...validateUuidFields(args), ...validateDateFields(args), ...validateNumericBounds(args)];
}

/**
 * Wraps a DynamicStructuredTool with pre-execution argument validation.
 * Returns a clear error message on invalid arguments instead of letting
 * the tool throw cryptic downstream errors.
 */
export function wrapToolWithArgumentValidator(tool: DynamicStructuredTool): DynamicStructuredTool {
  const originalFunc = tool.func.bind(tool);

  const wrapped = new DynamicStructuredTool({
    name: tool.name,
    description: tool.description,
    schema: tool.schema,
    responseFormat: tool.responseFormat,
    returnDirect: tool.returnDirect,
    verboseParsingErrors: tool.verboseParsingErrors,
    func: async (input, runManager) => {
      const args = (typeof input === 'object' && input !== null ? input : {}) as Record<
        string,
        unknown
      >;
      const errors = validateArguments(args);
      if (errors.length > 0) {
        const details = errors.map((e) => `- ${e.message}`).join('\n');
        return JSON.stringify({
          error: `Argomenti non validi per ${tool.name}:\n${details}\nCorreggi i parametri e riprova.`,
          validationErrors: errors,
        });
      }
      return originalFunc(input, runManager);
    },
  });

  wrapped.extras = tool.extras;
  wrapped.defaultConfig = tool.defaultConfig;
  return wrapped;
}
