import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { multipartFetch } from '@/lib/api-client';
import type { CompanyFormValues } from '@/components/organisms/company/company-schema';

const MAX_VISURA_BYTES = 10 * 1024 * 1024;

type VisuraExtracted = Partial<Record<keyof CompanyFormValues, string | null>>;

interface VisuraExtractResponse {
  readonly data?: { readonly extracted?: VisuraExtracted };
}

export function useCompanyVisuraExtraction(form: UseFormReturn<CompanyFormValues>) {
  const [isExtractingVisura, setIsExtractingVisura] = useState(false);

  async function handleVisuraFile(file: File) {
    if (file.size > MAX_VISURA_BYTES) {
      toast.error('File troppo grande (massimo 10 MB).');
      return;
    }
    setIsExtractingVisura(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await multipartFetch<VisuraExtractResponse>(
        '/companies/extract-from-visura',
        formData,
      );
      const extracted = response?.data?.extracted;
      if (!extracted) {
        toast.error('Nessun dato estratto dalla visura.');
        return;
      }
      (Object.keys(extracted) as Array<keyof CompanyFormValues>).forEach((key) => {
        const value = extracted[key];
        if (value && value.trim().length > 0) {
          form.setValue(key, value, { shouldValidate: true, shouldDirty: true });
        }
      });
      toast.success('Dati estratti dalla visura. Verifica e salva.');
    } catch (error) {
      console.error('Visura extraction error:', error);
      toast.error('Estrazione visura fallita. Verifica il file o compila manualmente.');
    } finally {
      setIsExtractingVisura(false);
    }
  }

  return { isExtractingVisura, handleVisuraFile };
}
