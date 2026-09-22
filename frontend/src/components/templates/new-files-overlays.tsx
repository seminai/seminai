import { CompanyFormSheet } from '@/components/organisms/company/company-form-sheet';
import { FilePreviewDrawer } from '@/components/molecules/file-preview-drawer';

interface NewFilesOverlaysProps {
  readonly isCompanySheetOpen: boolean;
  readonly preview: { readonly name: string; readonly url: string; readonly mimeType: string } | null;
  readonly onCompanySheetChange: (open: boolean) => void;
  readonly onCompanyCreated: (companyId: string) => void;
  readonly onPreviewClose: () => void;
}

export function NewFilesOverlays(props: NewFilesOverlaysProps): React.JSX.Element {
  return (
    <>
      <CompanyFormSheet
        open={props.isCompanySheetOpen}
        onOpenChange={props.onCompanySheetChange}
        onCreated={props.onCompanyCreated}
      />
      <FilePreviewDrawer
        fileName={props.preview?.name}
        url={props.preview?.url}
        mimeType={props.preview?.mimeType}
        open={Boolean(props.preview)}
        onOpenChange={(open) => {
          if (!open) props.onPreviewClose();
        }}
      />
    </>
  );
}
