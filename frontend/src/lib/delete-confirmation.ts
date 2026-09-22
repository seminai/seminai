export const DELETE_CONFIRMATION_TEXT = "ELIMINA";

export function isDeleteConfirmationValid(
  value: string,
  expected: string,
): boolean {
  return value.trim() === expected;
}
