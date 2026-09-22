import type { RefObject } from "react";
import { FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RulePdfFieldProps {
  readonly fileInputRef: RefObject<HTMLInputElement | null>;
  readonly existingUrl?: string | null;
  readonly existingName?: string | null;
  readonly currentFile: File | null;
  readonly onFileChange: (file: File | null) => void;
}

export function RulePdfField({
  fileInputRef,
  existingUrl,
  existingName,
  currentFile,
  onFileChange,
}: RulePdfFieldProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Allegato PDF</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {existingUrl && !currentFile && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <a
              href={existingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate text-sm text-primary hover:underline"
            >
              {existingName ?? "Visualizza PDF"}
            </a>
          </div>
        )}
        {currentFile && (
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 truncate text-sm">{currentFile.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ml-auto shrink-0"
              onClick={() => onFileChange(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <FileText className="h-4 w-4" />
          {existingUrl || currentFile ? "Sostituisci PDF" : "Carica PDF"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
      </CardContent>
    </Card>
  );
}
