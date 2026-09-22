import type { ArchiveListItem } from '@/types/extraction';

export type SelectedNode =
  | { readonly type: 'none' }
  | { readonly type: 'company'; readonly companyId: string; readonly companyName: string }
  | {
      readonly type: 'category';
      readonly companyId: string;
      readonly companyName: string;
      readonly categoryKey: string;
      readonly categoryLabel: string;
      readonly count: number;
    }
  | {
      readonly type: 'item';
      readonly companyId: string;
      readonly companyName: string;
      readonly categoryLabel: string;
      readonly item: ArchiveListItem;
    };
