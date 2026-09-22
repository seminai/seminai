import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isDeleteConfirmationValid } from "@/lib/delete-confirmation";

interface ConfirmDeleteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel?: string;
  readonly isPending?: boolean;
  readonly confirmationText?: string;
  readonly confirmationLabel?: string;
  readonly onConfirm: () => void;
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Elimina",
  isPending = false,
  confirmationText,
  confirmationLabel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const [typedValue, setTypedValue] = useState("");
  const requiresTypedConfirmation = Boolean(confirmationText);
  const canConfirm =
    !requiresTypedConfirmation ||
    isDeleteConfirmationValid(typedValue, confirmationText ?? "");

  useEffect(() => {
    if (!open) setTypedValue("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {requiresTypedConfirmation && (
          <div className="space-y-2">
            <label
              htmlFor="delete-confirmation"
              className="text-sm font-medium"
            >
              {confirmationLabel ?? `Digita ${confirmationText} per confermare`}
            </label>
            <Input
              id="delete-confirmation"
              value={typedValue}
              onChange={(event) => setTypedValue(event.target.value)}
              disabled={isPending}
              autoComplete="off"
            />
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Annulla
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending || !canConfirm}
          >
            {isPending ? "Eliminazione..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
