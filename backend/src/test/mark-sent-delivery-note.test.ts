import { IDeliveryNoteRepository } from '../domain/repositories/IDeliveryNoteRepository';
import { MarkSentDeliveryNoteUseCase } from '../application/use-cases/delivery-note/MarkSentDeliveryNoteUseCase';
import { AppError } from '../domain/errors/AppError';

describe('MarkSentDeliveryNoteUseCase', () => {
  it('delegates to the repository markSent', async () => {
    const markSent = jest.fn().mockResolvedValue({
      deliveryNote: { id: 'ddt-1', status: 'SENT' },
      items: [],
    });
    const repo = { markSent } as unknown as IDeliveryNoteRepository;

    const result = await new MarkSentDeliveryNoteUseCase(repo).execute('ddt-1');

    expect(markSent).toHaveBeenCalledWith('ddt-1');
    expect(result.deliveryNote.status).toBe('SENT');
  });

  it('propagates DDT_ALREADY_SENT from the repository', async () => {
    const markSent = jest
      .fn()
      .mockRejectedValue(AppError.conflict('già inviato', 'DDT_ALREADY_SENT'));
    const repo = { markSent } as unknown as IDeliveryNoteRepository;

    await expect(new MarkSentDeliveryNoteUseCase(repo).execute('ddt-1')).rejects.toMatchObject({
      code: 'DDT_ALREADY_SENT',
    });
  });
});
