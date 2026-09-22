import type { NavigateOptions } from '@tanstack/react-router';

export interface AddDataFlowSearch {
  readonly type?: 'file' | 'plan' | 'manual';
  readonly mode?: 'manual' | 'auto';
  readonly entity?: string;
}

/**
 * Logical parent of each screen in the /add-data flow, used as fallback when
 * the browser history cannot go back (deep link, fresh tab).
 */
export function getAddDataBackTarget(search: AddDataFlowSearch): NavigateOptions {
  if (search.type === 'plan' && search.mode) {
    return { to: '/add-data', search: { type: 'plan' } } as NavigateOptions;
  }
  if (search.type === 'manual' && search.entity) {
    return { to: '/add-data', search: { type: 'manual' } } as NavigateOptions;
  }
  if (search.type) {
    return { to: '/add-data', search: {} } as NavigateOptions;
  }
  return { to: '/home' } as NavigateOptions;
}
