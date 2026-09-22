import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockStreamAgentChat = vi.fn();

vi.mock('@/generated/api/agent-chat/agent-chat', () => ({
  getAgentChatThreadsThreadIdStreamEvents: vi.fn(),
  getAgentChatThreadsThreadIdStreamState: vi.fn(),
  postAgentChatApprove: vi.fn(),
  postAgentChatCancel: vi.fn(),
  postAgentChatReject: vi.fn(),
}));

vi.mock('@/lib/agent-chat-stream', () => ({
  streamAgentChat: (...args: unknown[]) => mockStreamAgentChat(...args),
}));

vi.mock('@/lib/analytics', () => ({
  capture: vi.fn(),
}));

import { getStreamSnapshot, retryStream, startStream } from './chat-stream-store';

function createFile(): File {
  return new File(['demo'], 'leaf.png', { type: 'image/png' });
}

describe('chat attachment stream state', () => {
  beforeEach(() => {
    mockStreamAgentChat.mockReset();
  });

  it('keeps selected files as uploading transient attachments', async () => {
    const inputFile = createFile();
    mockStreamAgentChat.mockResolvedValueOnce(undefined);

    await startStream({
      threadId: 'thread-uploading-attachments',
      chatId: 'chat-uploading-attachments',
      payload: { message: 'Analizza', files: [inputFile] },
    });

    const actualSnapshot = getStreamSnapshot('thread-uploading-attachments');
    expect(actualSnapshot?.transientUser?.attachments[0]).toMatchObject({
      name: 'leaf.png',
      mimeType: 'image/png',
      size: inputFile.size,
      kind: 'image',
      status: 'uploading',
    });
    expect(actualSnapshot?.lastPayload?.files?.[0]).toBe(inputFile);
  });

  it('marks pending attachments as failed and retries with the original file payload', async () => {
    const inputFile = createFile();
    mockStreamAgentChat.mockRejectedValueOnce(new Error('Upload failed'));

    await startStream({
      threadId: 'thread-failed-attachments',
      chatId: 'chat-failed-attachments',
      payload: { message: 'Analizza', files: [inputFile] },
    });

    const failedSnapshot = getStreamSnapshot('thread-failed-attachments');
    expect(failedSnapshot?.transientUser?.attachments[0]?.status).toBe('error');

    mockStreamAgentChat.mockResolvedValueOnce(undefined);
    retryStream('thread-failed-attachments', 'chat-failed-attachments');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockStreamAgentChat).toHaveBeenLastCalledWith(
      expect.objectContaining({ files: [inputFile] }),
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });
});
