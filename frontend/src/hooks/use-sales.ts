import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { customFetch } from '@/lib/api-client';
import { getApiBaseUrl } from '@/lib/api-base-url';
import type {
  BusinessPartner,
  CreateBusinessPartnerPayload,
  DeliveryNoteStatus,
  DeliveryNoteSummary,
  InvoiceSummary,
  PartnerType,
  SalesOrderStatus,
  SalesOrderSummary,
} from '@/types/sales';

interface ApiEnvelope<T> {
  readonly status: string;
  readonly data: T;
}

const salesKeys = {
  partners: (companyId: string, type?: PartnerType, q?: string) =>
    ['business-partners', companyId, type ?? 'all', q ?? ''] as const,
  orders: (companyId: string, status?: SalesOrderStatus) =>
    ['sales-orders', companyId, status ?? 'all'] as const,
  deliveryNotes: (companyId: string, status?: DeliveryNoteStatus) =>
    ['delivery-notes', companyId, status ?? 'all'] as const,
  invoices: (companyId: string, overdue?: boolean) =>
    ['sales-invoices', companyId, overdue ? 'overdue' : 'all'] as const,
};

function buildParams(entries: Record<string, string | undefined>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value !== '') params[key] = value;
  }
  return params;
}

/** Lists/searches customers or suppliers of a company. */
export function useBusinessPartners(companyId: string | undefined, type?: PartnerType, q?: string) {
  return useQuery({
    queryKey: salesKeys.partners(companyId ?? '', type, q),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const res = await customFetch<ApiEnvelope<{ partners: BusinessPartner[] }>>({
        url: '/business-partners',
        method: 'GET',
        params: buildParams({ companyId: companyId ?? '', type, q }),
      });
      return res.data.partners;
    },
  });
}

/** Creates a customer/supplier and invalidates the relevant lists. */
export function useCreateBusinessPartner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateBusinessPartnerPayload) => {
      const res = await customFetch<ApiEnvelope<{ partner: BusinessPartner; reused: boolean }>>({
        url: '/business-partners',
        method: 'POST',
        data: payload,
      });
      return res.data;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['business-partners', variables.companyId] });
    },
  });
}

/** Toggles per-customer order follow-ups (reuses the existing PATCH /business-partners/:id). */
export function useUpdatePartnerFollowUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      partnerId: string;
      companyId: string;
      followUpEnabled: boolean;
    }) => {
      const res = await customFetch<ApiEnvelope<{ partner: BusinessPartner }>>({
        url: `/business-partners/${vars.partnerId}`,
        method: 'PATCH',
        data: { followUpEnabled: vars.followUpEnabled },
      });
      return res.data.partner;
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['business-partners', vars.companyId] });
    },
  });
}

/** Lists a company's sales orders. */
export function useSalesOrders(companyId: string | undefined, status?: SalesOrderStatus) {
  return useQuery({
    queryKey: salesKeys.orders(companyId ?? '', status),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const res = await customFetch<ApiEnvelope<{ orders: SalesOrderSummary[] }>>({
        url: '/orders',
        method: 'GET',
        params: buildParams({ companyId: companyId ?? '', status }),
      });
      return res.data.orders;
    },
  });
}

/** Lists a company's DDTs. */
export function useDeliveryNotes(companyId: string | undefined, status?: DeliveryNoteStatus) {
  return useQuery({
    queryKey: salesKeys.deliveryNotes(companyId ?? '', status),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const res = await customFetch<ApiEnvelope<{ deliveryNotes: DeliveryNoteSummary[] }>>({
        url: '/ddt',
        method: 'GET',
        params: buildParams({ companyId: companyId ?? '', status }),
      });
      return res.data.deliveryNotes;
    },
  });
}

/** Cancels a DDT (storno/rientro magazzino) and refreshes the lists. */
export function useCancelDeliveryNote(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { deliveryNoteId: string; reason?: string }) => {
      const res = await customFetch<ApiEnvelope<{ deliveryNote: unknown }>>({
        url: `/ddt/${params.deliveryNoteId}/cancel`,
        method: 'POST',
        data: { reason: params.reason },
      });
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['delivery-notes', companyId] });
      void queryClient.invalidateQueries({ queryKey: ['sales-orders', companyId] });
    },
  });
}

/** Invalidates the commercial inbox/deadlines + sales lists after an order advances. */
function invalidateCommercial(queryClient: QueryClient, companyId: string): void {
  void queryClient.invalidateQueries({ queryKey: ['commercial', 'inbox', companyId] });
  void queryClient.invalidateQueries({ queryKey: ['commercial', 'deadlines', companyId] });
  void queryClient.invalidateQueries({ queryKey: ['sales-orders', companyId] });
  void queryClient.invalidateQueries({ queryKey: ['delivery-notes', companyId] });
  void queryClient.invalidateQueries({ queryKey: ['sales-invoices', companyId] });
}

/** Lists a company's sales invoices (optionally only the overdue ones). */
export function useInvoices(companyId: string | undefined, overdue?: boolean) {
  return useQuery({
    queryKey: salesKeys.invoices(companyId ?? '', overdue),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const res = await customFetch<ApiEnvelope<{ invoices: InvoiceSummary[] }>>({
        url: '/sales-invoices',
        method: 'GET',
        params: buildParams({ companyId: companyId ?? '', overdue: overdue ? 'true' : undefined }),
      });
      return res.data.invoices;
    },
  });
}

/** Emails the customer a payment reminder for an overdue invoice. */
export function useSendPaymentReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { invoiceId: string; companyId: string }) => {
      const res = await customFetch<ApiEnvelope<{ sent: boolean }>>({
        url: `/sales-invoices/${vars.invoiceId}/send-reminder`,
        method: 'POST',
        data: {},
      });
      return res.data;
    },
    onSuccess: (_data, vars) => invalidateCommercial(queryClient, vars.companyId),
  });
}

/** Marks an invoice as paid (drops it out of the overdue view). */
export function useMarkInvoicePaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { invoiceId: string; companyId: string }) => {
      const res = await customFetch<ApiEnvelope<{ invoice: InvoiceSummary }>>({
        url: `/sales-invoices/${vars.invoiceId}/mark-paid`,
        method: 'POST',
        data: {},
      });
      return res.data.invoice;
    },
    onSuccess: (_data, vars) => invalidateCommercial(queryClient, vars.companyId),
  });
}

/** Generates a non-fiscal proforma from an order (approve-only inbox path). */
export function useGenerateProforma() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { orderId: string; companyId: string }) => {
      const res = await customFetch<ApiEnvelope<{ proformaInvoice: { id: string } }>>({
        url: `/orders/${vars.orderId}/generate-proforma`,
        method: 'POST',
        data: {},
      });
      return res.data;
    },
    onSuccess: (_data, vars) => invalidateCommercial(queryClient, vars.companyId),
  });
}

/** Confirms a DRAFT order (reserves stock). */
export function useConfirmOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { orderId: string; companyId: string }) => {
      const res = await customFetch<ApiEnvelope<{ order: unknown }>>({
        url: `/orders/${vars.orderId}/confirm`,
        method: 'POST',
        data: {},
      });
      return res.data;
    },
    onSuccess: (_data, vars) => invalidateCommercial(queryClient, vars.companyId),
  });
}

/** Generates a DDT from a CONFIRMED order (atomic warehouse unload). */
export function useGenerateDeliveryNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { orderId: string; companyId: string }) => {
      const res = await customFetch<ApiEnvelope<{ deliveryNote: { id: string } }>>({
        url: `/orders/${vars.orderId}/generate-ddt`,
        method: 'POST',
        data: {},
      });
      return res.data;
    },
    onSuccess: (_data, vars) => invalidateCommercial(queryClient, vars.companyId),
  });
}

/** Result of sending the courier summary. */
export interface CourierSummaryResult {
  readonly sent: number;
  readonly recipients: number;
  readonly courierEmail: string;
}

/** Emails the courier the pending-DDT summary and marks those DDTs SENT (inbox one-click). */
export function useSendCourierSummary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { companyId: string }) => {
      const res = await customFetch<ApiEnvelope<CourierSummaryResult>>({
        url: '/ddt/send-courier-summary',
        method: 'POST',
        data: { companyId: vars.companyId },
      });
      return res.data;
    },
    onSuccess: (_data, vars) => invalidateCommercial(queryClient, vars.companyId),
  });
}

/** Marks a single DDT as SENT (handed to the courier). */
export function useMarkDeliveryNoteSent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { deliveryNoteId: string; companyId: string }) => {
      const res = await customFetch<ApiEnvelope<{ deliveryNote: unknown }>>({
        url: `/ddt/${vars.deliveryNoteId}/mark-sent`,
        method: 'POST',
        data: {},
      });
      return res.data;
    },
    onSuccess: (_data, vars) => invalidateCommercial(queryClient, vars.companyId),
  });
}

/** Absolute URL of the printable DDT document (opened in a new tab). */
export function deliveryNotePrintUrl(deliveryNoteId: string): string {
  return `${getApiBaseUrl()}/ddt/${deliveryNoteId}/print`;
}

/** Absolute URL of the printable proforma document (opened in a new tab). */
export function proformaPrintUrl(proformaId: string): string {
  return `${getApiBaseUrl()}/proforma/${proformaId}/print`;
}

/** Absolute URL of the fixed-column agent order template (.xlsx download). */
export function orderTemplateUrl(): string {
  return `${getApiBaseUrl()}/orders/template.xlsx`;
}
