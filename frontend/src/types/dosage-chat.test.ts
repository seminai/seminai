import { describe, expect, it } from 'vitest';
import { mapChatMessages, type DosageChatMessage } from './dosage-chat';

describe('mapChatMessages', () => {
  it('maps persisted message attachment metadata', () => {
    const inputMessages: readonly DosageChatMessage[] = [
      {
        id: 'message-1',
        role: 'USER',
        content: 'Analizza il file',
        createdAt: '2026-06-07T10:00:00.000Z',
        status: null,
        pendingToolCalls: null,
        metadata: {
          attachments: [
            {
              id: 'attachment-1',
              name: 'leaf.png',
              mimeType: 'image/png',
              size: 2048,
              url: 'https://storage.example/leaf.png',
              kind: 'image',
            },
          ],
        },
      },
    ];

    const actualMessages = mapChatMessages(inputMessages);

    expect(actualMessages[0]?.attachments).toEqual([
      {
        id: 'attachment-1',
        name: 'leaf.png',
        mimeType: 'image/png',
        size: 2048,
        url: 'https://storage.example/leaf.png',
        kind: 'image',
        status: 'sent',
      },
    ]);
  });

  it('ignores malformed attachment metadata', () => {
    const inputMessages: readonly DosageChatMessage[] = [
      {
        id: 'message-1',
        role: 'USER',
        content: 'Analizza il file',
        createdAt: '2026-06-07T10:00:00.000Z',
        status: null,
        metadata: { attachments: [{ name: 'missing-url.pdf', size: 10 }] },
      },
    ];

    const actualMessages = mapChatMessages(inputMessages);

    expect(actualMessages[0]?.attachments).toEqual([]);
  });
});
