import { useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Mic, MicOff, ArrowUp, Loader2, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MentionChip } from '@/components/molecules/mention-chip';
import { MentionAutocomplete } from '@/components/molecules/mention-autocomplete';
import { formatBytes } from '@/lib/format-bytes';
import type { MentionItem, MentionSearchResultItem } from '@/types/mention';

export interface ChatAttachmentItem {
  readonly id: string;
  readonly name: string;
  readonly size: number;
}

interface ChatInputProps {
  readonly message: string;
  readonly attachments: readonly ChatAttachmentItem[];
  readonly mentions: readonly MentionItem[];
  readonly mentionResults: readonly MentionSearchResultItem[];
  readonly isMentionActive: boolean;
  readonly isMentionSearching: boolean;
  readonly isSending: boolean;
  readonly isRecording: boolean;
  readonly isTranscribingAudio: boolean;
  readonly errorMessage: string | null;
  readonly onMessageChange: (value: string) => void;
  readonly onSend: () => void;
  readonly onCancel?: () => void;
  readonly onSelectAttachments: (files: readonly File[]) => void;
  readonly onRegisterAttachmentPicker?: (open: () => void) => void;
  readonly onToggleRecording: () => void;
  readonly onRemoveAttachment: (attachmentId: string) => void;
  readonly onMentionSelect: (item: MentionSearchResultItem) => void;
  readonly onRemoveMention: (mentionId: string) => void;
  readonly onMentionQueryChange: (query: string, isActive: boolean) => void;
  readonly mentionDropdownSide?: 'top' | 'bottom';
}

/**
 * Extracts the mention query from the text based on cursor position.
 * Looks for `@` followed by non-space characters before the cursor.
 */
function extractMentionQuery(text: string, cursorPos: number): { query: string; isActive: boolean } {
  const textBeforeCursor = text.slice(0, cursorPos);
  const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);
  if (!atMatch) return { query: '', isActive: false };
  return { query: atMatch[1], isActive: true };
}

export function ChatInput({
  message,
  attachments,
  mentions,
  mentionResults,
  isMentionActive,
  isMentionSearching,
  isSending,
  isRecording,
  isTranscribingAudio,
  errorMessage,
  onMessageChange,
  onSend,
  onCancel,
  onSelectAttachments,
  onRegisterAttachmentPicker,
  onToggleRecording,
  onRemoveAttachment,
  onMentionSelect,
  onRemoveMention,
  onMentionQueryChange,
  mentionDropdownSide = 'top',
}: ChatInputProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachmentsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!onRegisterAttachmentPicker) return;
    onRegisterAttachmentPicker(() => {
      attachmentsInputRef.current?.click();
    });
  }, [onRegisterAttachmentPicker]);

  const canSend = Boolean(message.trim()) && !isTranscribingAudio && !isRecording;

  const handleChange = useCallback(
    (value: string) => {
      onMessageChange(value);
      const cursorPos = textareaRef.current?.selectionStart ?? value.length;
      const { query, isActive } = extractMentionQuery(value, cursorPos);
      onMentionQueryChange(query, isActive);
    },
    [onMessageChange, onMentionQueryChange],
  );

  const handleMentionSelect = useCallback(
    (item: MentionSearchResultItem) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursorPos = textarea.selectionStart ?? message.length;
      const textBeforeCursor = message.slice(0, cursorPos);
      const atIndex = textBeforeCursor.lastIndexOf('@');
      if (atIndex === -1) return;

      const before = message.slice(0, atIndex);
      const after = message.slice(cursorPos);
      const insertedText = `@${item.label} `;
      const newMessage = before + insertedText + after;

      onMessageChange(newMessage);
      onMentionSelect(item);
      onMentionQueryChange('', false);

      // Restore cursor position after React re-render
      requestAnimationFrame(() => {
        const newCursorPos = before.length + insertedText.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();
      });
    },
    [message, onMessageChange, onMentionSelect, onMentionQueryChange],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Escape' && isMentionActive) {
        event.preventDefault();
        onMentionQueryChange('', false);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey && !isMentionActive) {
        event.preventDefault();
        onSend();
      }
    },
    [isMentionActive, onMentionQueryChange, onSend],
  );

  const hasChips = attachments.length > 0 || mentions.length > 0;

  return (
    <div className="w-full">
      <div ref={containerRef} className="relative rounded-xl border shadow-sm">
        <input
          ref={attachmentsInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const fileList = event.target.files;
            if (!fileList || fileList.length === 0) return;
            onSelectAttachments(Array.from(fileList));
            event.currentTarget.value = '';
          }}
        />

        {isMentionActive && (
          <MentionAutocomplete
            results={mentionResults}
            isLoading={isMentionSearching}
            anchorRef={containerRef}
            preferredSide={mentionDropdownSide}
            onSelect={handleMentionSelect}
            onClose={() => onMentionQueryChange('', false)}
          />
        )}

        {hasChips && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {mentions.map((mention) => (
              <MentionChip
                key={`${mention.type}-${mention.id}`}
                type={mention.type}
                label={mention.label}
                onRemove={() => onRemoveMention(mention.id)}
                disabled={isTranscribingAudio}
              />
            ))}
            {attachments.map((attachment) => (
              <Badge
                key={attachment.id}
                variant="outline"
                className="gap-1 border-border bg-muted/40 pr-1 text-foreground"
              >
                <span className="max-w-40 truncate">{attachment.name}</span>
                <span className="text-muted-foreground">({formatBytes(attachment.size)})</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onRemoveAttachment(attachment.id)}
                  disabled={isTranscribingAudio}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={t('home.chatInput.placeholder')}
          className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-sm outline-none placeholder:text-muted-foreground"
          rows={3}
          onKeyDown={handleKeyDown}
        />
        {errorMessage && (
          <p className="px-4 pb-2 text-xs text-destructive">{errorMessage}</p>
        )}
        <div className="flex items-center justify-end px-3 pb-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => attachmentsInputRef.current?.click()}
              disabled={isTranscribingAudio}
              title={t('home.chatInput.addAttachments')}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleRecording}
              disabled={isTranscribingAudio}
              title={isRecording ? t('home.chatInput.stopRecording') : t('home.chatInput.recordAudio')}
              className={isRecording ? 'text-destructive' : undefined}
            >
              {isTranscribingAudio ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isRecording ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
            {isSending && onCancel ? (
              <Button
                size="icon-sm"
                variant="secondary"
                className="rounded-full"
                onClick={onCancel}
                title={t('home.chatInput.cancel', { defaultValue: 'Annulla' })}
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon-sm"
                className="rounded-full"
                disabled={!canSend}
                onClick={onSend}
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
