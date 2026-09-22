import { Upload, Plus, MessageSquareText, Monitor, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CHAT_QUICK_ACTIONS,
  type ChatQuickActionId,
} from '@/constants/chat-quick-actions';

const ACTION_ICONS: Record<ChatQuickActionId, typeof Upload> = {
  upload_documents: Upload,
  treatment_plan: Plus,
  chat_with_data: MessageSquareText,
  write_to_colleague: Monitor,
  create_rules: SlidersHorizontal,
};

interface ChatActionBarProps {
  readonly onSelectAction: (id: ChatQuickActionId) => void;
  readonly isBusy?: boolean;
}

export function ChatActionBar({ onSelectAction, isBusy = false }: ChatActionBarProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {CHAT_QUICK_ACTIONS.map((action) => {
        const Icon = ACTION_ICONS[action.id];
        return (
          <Button
            key={action.id}
            variant="outline"
            size="sm"
            className="gap-2 rounded-full"
            type="button"
            disabled={isBusy}
            onClick={() => onSelectAction(action.id)}
          >
            <Icon className="h-4 w-4" />
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}
