import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Paperclip, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { customFetch, multipartFetch } from '@/lib/api-client';
import {
  buildContactEmailFormData,
  CONTACT_EMAIL_MAX_FILES,
  CONTACT_EMAIL_PDF_MIME,
  validateContactEmailFiles,
  type ContactEmailFileValidationCode,
} from '@/lib/contact-email-form';
import { formatBytes } from '@/lib/format-bytes';

function createBookCallSchema(t: TFunction) {
  return z.object({
    name: z.string().min(1, t('auth.errors.nameRequired')),
    email: z.email(t('auth.errors.invalidEmail')),
    date: z.string().min(1, t('auth.errors.preferredDateRequired')),
    message: z.string().min(1, t('auth.errors.messageRequired')),
  });
}

type BookCallForm = z.infer<ReturnType<typeof createBookCallSchema>>;

interface AttachmentItem {
  readonly id: string;
  readonly file: File;
}

interface BookCallDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

function attachmentValidationMessage(
  code: ContactEmailFileValidationCode,
  t: TFunction,
): string {
  switch (code) {
    case 'INVALID_TYPE':
      return t('auth.bookCall.attachmentInvalidType');
    case 'FILE_TOO_LARGE':
      return t('auth.bookCall.attachmentFileTooLarge');
    case 'TOTAL_TOO_LARGE':
      return t('auth.bookCall.attachmentTotalTooLarge');
    case 'TOO_MANY_FILES':
      return t('auth.bookCall.attachmentTooMany');
  }
}

export function BookCallDialog({ open, onOpenChange }: BookCallDialogProps) {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<readonly AttachmentItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bookCallSchema = useMemo(() => createBookCallSchema(t), [t]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<BookCallForm>({
    resolver: zodResolver(bookCallSchema),
  });

  const clearAttachments = useCallback(() => {
    setAttachments([]);
    setAttachmentError(null);
  }, []);

  const handleSelectFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const nextFiles = [...attachments.map((item) => item.file), ...Array.from(fileList)];
      const validationError = validateContactEmailFiles(nextFiles);
      if (validationError) {
        setAttachmentError(attachmentValidationMessage(validationError, t));
        return;
      }
      setAttachmentError(null);
      setAttachments((prev) => [
        ...prev,
        ...Array.from(fileList).map((file) => ({
          id: crypto.randomUUID(),
          file,
        })),
      ]);
    },
    [attachments, t],
  );

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
    setAttachmentError(null);
  }, []);

  const onSubmit = async (data: BookCallForm) => {
    setSendError(null);
    const body = `DATA DI RICHIESTA INCONTRO: ${data.date}\n\nTESTO: ${data.message}`;
    const files = attachments.map((item) => item.file);
    const validationError = validateContactEmailFiles(files);
    if (validationError) {
      setAttachmentError(attachmentValidationMessage(validationError, t));
      return;
    }

    try {
      if (files.length > 0) {
        await multipartFetch(
          '/email/send-email',
          buildContactEmailFormData({
            name: data.name,
            email: data.email,
            body,
            files,
          }),
        );
      } else {
        await customFetch({
          url: '/email/send-email',
          method: 'POST',
          data: { name: data.name, email: data.email, body },
        });
      }
      setSent(true);
      reset();
      clearAttachments();
    } catch {
      setSendError(t('auth.bookCall.sendError'));
    }
  };

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setSent(false);
      setSendError(null);
      clearAttachments();
    }
  };

  const canAddMoreAttachments = attachments.length < CONTACT_EMAIL_MAX_FILES;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('auth.bookCall.title')}</DialogTitle>
          <DialogDescription>{t('auth.bookCall.description')}</DialogDescription>
        </DialogHeader>

        {sent ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t('auth.bookCall.sent')}
          </p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="bc-name">{t('auth.fields.name')}</Label>
              <Input id="bc-name" placeholder="Mario Rossi" {...register('name')} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="bc-email">{t('common.email')}</Label>
              <Input
                id="bc-email"
                type="email"
                placeholder={t('auth.placeholders.email')}
                {...register('email')}
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="bc-date">{t('auth.bookCall.dateLabel')}</Label>
              <Input
                id="bc-date"
                placeholder={t('auth.bookCall.datePlaceholder')}
                {...register('date')}
              />
              {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="bc-message">{t('auth.bookCall.message')}</Label>
              <Textarea
                id="bc-message"
                placeholder={t('auth.bookCall.messagePlaceholder')}
                rows={3}
                {...register('message')}
              />
              {errors.message && (
                <p className="text-sm text-destructive">{errors.message.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label>
                {t('auth.bookCall.attachmentsLabel')}{' '}
                <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
              </Label>
              <input
                ref={fileInputRef}
                type="file"
                accept={CONTACT_EMAIL_PDF_MIME}
                multiple
                className="hidden"
                onChange={(event) => {
                  handleSelectFiles(event.target.files);
                  event.currentTarget.value = '';
                }}
              />
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((attachment) => (
                    <Badge
                      key={attachment.id}
                      variant="outline"
                      className="gap-1 border-border bg-muted/40 pr-1 text-foreground"
                    >
                      <span className="max-w-40 truncate">{attachment.file.name}</span>
                      <span className="text-muted-foreground">
                        ({formatBytes(attachment.file.size)})
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleRemoveAttachment(attachment.id)}
                        aria-label={`Remove ${attachment.file.name}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}
              {canAddMoreAttachments && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="mr-2 h-4 w-4" />
                  {t('auth.bookCall.addAttachments')}
                </Button>
              )}
              {attachmentError && (
                <p className="text-sm text-destructive">{attachmentError}</p>
              )}
            </div>

            {sendError && <p className="text-sm text-destructive">{sendError}</p>}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? t('auth.bookCall.sending') : t('auth.bookCall.send')}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
