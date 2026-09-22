export type VerificationStatusTone = 'red' | 'green' | 'yellow';

export interface VerificationStatusMeta {
  readonly label: string;
  readonly tone: VerificationStatusTone;
}

export function getVerificationStatusMeta(input: {
  readonly isVerified: boolean;
  readonly conformityChecked: boolean;
}): VerificationStatusMeta {
  if (input.isVerified) {
    return { label: 'Verificata', tone: 'green' };
  }
  if (input.conformityChecked) {
    return { label: 'Non verificata', tone: 'red' };
  }
  return { label: 'Conformità non verificata', tone: 'yellow' };
}
