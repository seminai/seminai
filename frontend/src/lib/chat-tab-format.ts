const timeFormatter = new Intl.DateTimeFormat('it-IT', {
  hour: '2-digit',
  minute: '2-digit',
});

export interface ChatTabTitleInput {
  readonly message?: string | null;
  readonly updatedAt?: string;
}

export interface ChatTabMessage {
  readonly role: string;
  readonly content: string;
}

export function toDisplayTime(isoDate?: string): string {
  if (!isoDate) return '--:--';
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? '--:--' : timeFormatter.format(date);
}

export function normalizeChatTabText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function isUserRole(role: string): boolean {
  return role.trim().toUpperCase() === 'USER';
}

export function buildChatTabTitle(input: ChatTabTitleInput): string {
  const normalized = input.message ? normalizeChatTabText(input.message) : '';
  return normalized || `Chat ${toDisplayTime(input.updatedAt)}`;
}

export function buildChatTabTitleFromMessages(
  messages: readonly ChatTabMessage[],
  updatedAt?: string,
): string {
  const firstUserMessage = messages.find((message) => isUserRole(message.role));
  return buildChatTabTitle({ message: firstUserMessage?.content, updatedAt });
}
