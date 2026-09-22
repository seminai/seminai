/**
 * Evolution API Service
 *
 * Service for interacting with Evolution API to manage WhatsApp connections.
 * @see https://doc.evolution-api.com
 */

export interface EvolutionApiConfig {
  baseUrl: string;
  globalApiKey: string;
}

export interface CreateInstanceRequest {
  instanceName: string;
  token?: string;
  qrcode?: boolean;
  integration?: string;
}

export interface CreateInstanceResponse {
  instance: {
    instanceName: string;
    instanceId: string;
    integration: string;
    webhookWaBusiness: string | null;
    accessTokenWaBusiness: string | null;
    status: string;
  };
  hash: {
    apikey: string;
  };
  qrcode?: {
    pairingCode: string | null;
    code: string;
    base64: string;
    count: number;
  };
}

export interface ConnectionStateResponse {
  instance: {
    instanceName: string;
    state: 'open' | 'close' | 'connecting';
  };
}

export interface ConnectInstanceResponse {
  pairingCode: string | null;
  code: string;
  base64: string;
  count: number;
}

export interface FetchInstancesResponse {
  instance: {
    instanceName: string;
    instanceId: string;
    owner: string;
    profileName: string;
    profilePictureUrl: string | null;
    profileStatus: string | null;
    status: string;
    serverUrl: string;
    apikey: string;
    integration: string;
  };
}

export interface SendTextMessageRequest {
  number: string;
  text: string;
  delay?: number;
}

export interface SendTextMessageResponse {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: {
    extendedTextMessage?: {
      text: string;
    };
  };
  messageTimestamp: string;
  status: string;
}

export interface WebhookConfig {
  url: string;
  webhookByEvents: boolean;
  webhookBase64: boolean;
  events: string[];
}

export interface SetWebhookResponse {
  webhook: WebhookConfig;
}

export class EvolutionApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = 'EvolutionApiError';
  }
}

/**
 * Service class for Evolution API integration.
 */
export class EvolutionApiService {
  private readonly baseUrl: string;
  private readonly globalApiKey: string;

  constructor(config: EvolutionApiConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.globalApiKey = config.globalApiKey;
  }

  /**
   * Create a new WhatsApp instance.
   */
  async createInstance(request: CreateInstanceRequest): Promise<CreateInstanceResponse> {
    const response = await this.request<CreateInstanceResponse>('POST', '/instance/create', {
      instanceName: request.instanceName,
      token: request.token,
      qrcode: request.qrcode ?? true,
      integration: request.integration ?? 'WHATSAPP-BAILEYS',
    });
    return response;
  }

  /**
   * Delete a WhatsApp instance.
   */
  async deleteInstance(instanceName: string): Promise<void> {
    await this.request('DELETE', `/instance/delete/${instanceName}`);
  }

  /**
   * Logout from WhatsApp instance (disconnect but keep instance).
   */
  async logoutInstance(instanceName: string): Promise<void> {
    await this.request('DELETE', `/instance/logout/${instanceName}`);
  }

  /**
   * Get connection state of an instance.
   */
  async getConnectionState(instanceName: string): Promise<ConnectionStateResponse> {
    return this.request<ConnectionStateResponse>(
      'GET',
      `/instance/connectionState/${instanceName}`,
    );
  }

  /**
   * Connect to WhatsApp instance and get QR code.
   */
  async connectInstance(instanceName: string): Promise<ConnectInstanceResponse> {
    return this.request<ConnectInstanceResponse>('GET', `/instance/connect/${instanceName}`);
  }

  /**
   * Restart a WhatsApp instance.
   */
  async restartInstance(instanceName: string): Promise<void> {
    await this.request('PUT', `/instance/restart/${instanceName}`);
  }

  /**
   * Fetch all instances or a specific one.
   */
  async fetchInstances(instanceName?: string): Promise<FetchInstancesResponse[]> {
    const url = instanceName
      ? `/instance/fetchInstances?instanceName=${instanceName}`
      : '/instance/fetchInstances';
    return this.request<FetchInstancesResponse[]>('GET', url);
  }

  /**
   * Send a text message.
   */
  async sendTextMessage(
    instanceName: string,
    request: SendTextMessageRequest,
  ): Promise<SendTextMessageResponse> {
    return this.request<SendTextMessageResponse>(
      'POST',
      `/message/sendText/${instanceName}`,
      request,
    );
  }

  /**
   * Set webhook configuration for an instance.
   */
  async setWebhook(instanceName: string, config: WebhookConfig): Promise<SetWebhookResponse> {
    return this.request<SetWebhookResponse>('POST', `/webhook/set/${instanceName}`, config);
  }

  /**
   * Get webhook configuration for an instance.
   */
  async getWebhook(instanceName: string): Promise<SetWebhookResponse> {
    return this.request<SetWebhookResponse>('GET', `/webhook/find/${instanceName}`);
  }

  /**
   * Check if a number is registered on WhatsApp.
   */
  async checkIsWhatsApp(
    instanceName: string,
    numbers: string[],
  ): Promise<{ exists: boolean; jid: string; number: string }[]> {
    return this.request<{ exists: boolean; jid: string; number: string }[]>(
      'POST',
      `/chat/whatsappNumbers/${instanceName}`,
      { numbers },
    );
  }

  /**
   * Make an HTTP request to Evolution API.
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: this.globalApiKey,
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      let responseBody: unknown;
      try {
        responseBody = await response.json();
      } catch {
        responseBody = await response.text();
      }

      // Extract error message from response body if available
      let errorMessage = `Evolution API request failed: ${response.status} ${response.statusText}`;
      if (responseBody && typeof responseBody === 'object') {
        const body = responseBody as Record<string, unknown>;
        if (body.message) {
          errorMessage = String(body.message);
        } else if (body.error) {
          errorMessage = String(body.error);
        }
      } else if (typeof responseBody === 'string') {
        errorMessage = responseBody;
      }

      throw new EvolutionApiError(errorMessage, response.status, responseBody);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }
}

/**
 * Create an instance of EvolutionApiService from environment variables.
 */
export function createEvolutionApiService(): EvolutionApiService {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const globalApiKey = process.env.EVOLUTION_API_KEY;

  if (!baseUrl || !globalApiKey) {
    throw new Error('EVOLUTION_API_URL and EVOLUTION_API_KEY environment variables are required');
  }

  return new EvolutionApiService({ baseUrl, globalApiKey });
}
