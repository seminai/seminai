import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { guardAgainstDuplicateQuestion } from '../duplicate-question-guard';

describe('guardAgainstDuplicateQuestion', () => {
  it('acknowledges an already answered professional context question', () => {
    const messages = [
      new AIMessage('Di cosa ti occupi o che ambito professionale ti interessa in questo periodo?'),
      new HumanMessage('Mi occupo di marketing, te lo ho gia detto'),
      new AIMessage('Di cosa ti occupi o che ambito professionale ti interessa in questo periodo?'),
    ];

    const result = guardAgainstDuplicateQuestion(
      messages,
      'Di cosa ti occupi o che ambito professionale ti interessa in questo periodo?',
    );

    expect(result).toContain('ti occupi di marketing');
    expect(result).not.toBe(
      'Di cosa ti occupi o che ambito professionale ti interessa in questo periodo?',
    );
  });

  it('keeps non-duplicated answers unchanged', () => {
    const message = 'Posso aiutarti con un piano operativo.';
    const result = guardAgainstDuplicateQuestion([new HumanMessage('Ciao')], message);

    expect(result).toBe(message);
  });
});
