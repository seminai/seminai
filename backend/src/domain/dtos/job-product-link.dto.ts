export interface JobLinkedProductDTO {
  readonly id: string;
  readonly name: string;
  readonly registrationNumber: string | null;
}

export interface JobProductLinkDTO {
  readonly jobId: string;
  readonly stockCount: number;
  readonly products: ReadonlyArray<JobLinkedProductDTO>;
}
