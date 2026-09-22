import { z } from 'zod';

const FISCAL_CODE_REGEX = /^[A-Z0-9]{11,16}$/;

export const companyKindSchema = z.enum(['AGRICULTURAL', 'MANUFACTURING']);

export const companySchema = z.object({
  // Required (not `.default()`): the form always supplies `kind` via defaultValues
  // (EMPTY_COMPANY_VALUES / locked workspace kind). A `.default()` would split zod's
  // input vs output type and break zodResolver/useForm typing.
  kind: companyKindSchema,
  name: z.string().min(1, 'Nome richiesto'),
  vatNumber: z
    .string()
    .regex(/^[0-9]{11}$/, 'Partita IVA: esattamente 11 cifre'),
  fiscalCode: z
    .string()
    .optional()
    .refine(
      (value) => !value || FISCAL_CODE_REGEX.test(value.toUpperCase()),
      'Codice fiscale: 11-16 caratteri (A-Z, 0-9)',
    ),
  city: z.string().optional(),
  address: z.string().optional(),
  cap: z.string().optional(),
  nation: z.string().optional(),
  email: z.string().email('Email non valida').optional().or(z.literal('')),
  phoneNumber: z.string().optional(),
  website: z.string().optional(),
});

export type CompanyFormValues = z.infer<typeof companySchema>;

export const EMPTY_COMPANY_VALUES: CompanyFormValues = {
  kind: 'AGRICULTURAL',
  name: '',
  vatNumber: '',
  fiscalCode: '',
  city: '',
  address: '',
  cap: '',
  nation: '',
  email: '',
  phoneNumber: '',
  website: '',
};
