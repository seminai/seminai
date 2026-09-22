import { Button } from "@/components/ui/button";

interface RulesMarketplacePagerProps {
  readonly page: number;
  readonly marketplace: { readonly total: number; readonly hasNextPage: boolean };
  readonly pageSize: number;
  readonly onPageChange: (page: number) => void;
}

export function RulesMarketplacePager({
  page,
  marketplace,
  pageSize,
  onPageChange,
}: RulesMarketplacePagerProps) {
  if (marketplace.total <= pageSize) return null;
  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Precedente
      </Button>
      <span className="text-xs text-muted-foreground">Pagina {page}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={!marketplace.hasNextPage}
        onClick={() => onPageChange(page + 1)}
      >
        Successiva
      </Button>
    </div>
  );
}
