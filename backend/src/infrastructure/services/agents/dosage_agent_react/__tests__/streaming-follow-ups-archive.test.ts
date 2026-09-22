import { generateFollowUpSuggestions } from '../streaming-follow-ups';
import type { WorkingMemory } from '../type/state';

describe('streaming-follow-ups archive suggestion', () => {
  it('suggests "view archive group" after create_treatment_jobs with a fresh group id', () => {
    const wm: WorkingMemory = {
      lastCreatedJobGroupId: 'grp-abc-123',
    };
    const suggestions = generateFollowUpSuggestions(wm, ['create_treatment_jobs'], 'it');

    expect(suggestions[0]).toEqual({
      id: 'suggest_view_archive_group',
      text: 'Vai al gruppo in Archivio per validare i job',
      action: 'navigate:/archive/jobs/grp-abc-123',
    });
  });

  it('does not include the archive suggestion when create_treatment_jobs has not run', () => {
    const wm: WorkingMemory = {
      lastCreatedJobGroupId: 'grp-abc-123',
    };
    const suggestions = generateFollowUpSuggestions(wm, ['search_products'], 'it');

    expect(suggestions.find((s) => s.id === 'suggest_view_archive_group')).toBeUndefined();
  });

  it('does not include the archive suggestion when there is no group id in WM', () => {
    const wm: WorkingMemory = {};
    const suggestions = generateFollowUpSuggestions(wm, ['create_treatment_jobs'], 'it');

    expect(suggestions.find((s) => s.id === 'suggest_view_archive_group')).toBeUndefined();
  });

  it('uses the English copy when language=en', () => {
    const wm: WorkingMemory = { lastCreatedJobGroupId: 'grp-en' };
    const suggestions = generateFollowUpSuggestions(wm, ['create_treatment_jobs'], 'en');
    expect(suggestions[0].text).toContain('archive group');
    expect(suggestions[0].action).toBe('navigate:/archive/jobs/grp-en');
  });
});
