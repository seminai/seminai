export interface PublicRuntimeConfig {
  readonly appMode: 'all' | 'api' | 'worker';
  readonly storageDriver: string;
  readonly setupCompleted: boolean;
  readonly llmProvider: string | null;
  readonly accessMode: string;
  readonly publicBaseUrl: string;
  readonly inviteRequired: boolean;
  readonly tunnelProvider: string;
  readonly features: {
    readonly qdrant: boolean;
    readonly ocr: boolean;
    readonly tavily: boolean;
    readonly googleLogin: boolean;
    readonly email: boolean;
  };
}

export const EMPTY_PUBLIC_RUNTIME_CONFIG: PublicRuntimeConfig = {
  appMode: 'all',
  storageDriver: 'local',
  setupCompleted: true,
  llmProvider: null,
  accessMode: 'lan',
  publicBaseUrl: 'http://127.0.0.1:8081',
  inviteRequired: true,
  tunnelProvider: 'none',
  features: {
    qdrant: false,
    ocr: false,
    tavily: false,
    googleLogin: false,
    email: false,
  },
};
