/** Grid layout for the "Aggiungi a mano" landing cards. */
export function getManualLandingGridClass(cardCount: number): string {
  if (cardCount <= 3) {
    return 'grid w-full max-w-3xl grid-cols-1 gap-6 sm:grid-cols-3';
  }
  return 'grid w-full max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5';
}

/** More than 3 cards must fit on a single row → compact card variant. */
export function isCompactCardLayout(cardCount: number): boolean {
  return cardCount > 3;
}
