import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';
import { config } from '../config';
import { User, Company, Field, Warehouse, ProductionUnit, ChatResponse } from '../types';

interface TranscriptionResponse {
  text: string;
  language?: string;
  duration?: number;
}

interface ApiResponse<T> {
  status: string;
  data: T;
}

interface VerifyPhoneResponse {
  exists: boolean;
  userId?: string;
  userName?: string;
}

interface LoginResponse {
  token: string;
  user: User;
}

interface SendOtpResponse {
  sent: boolean;
  maskedEmail: string;
}

interface VerifyOtpResponse {
  token: string;
  user: User;
}

export class SeminaiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  private setAuthToken(token: string): void {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  async verifyPhone(phoneNumber: string): Promise<VerifyPhoneResponse> {
    try {
      const response = await this.client.get<ApiResponse<VerifyPhoneResponse>>(
        '/auth/telegram/verify-phone',
        { params: { phone: phoneNumber } },
      );
      return response.data.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return { exists: false };
      }
      throw this.handleError(error);
    }
  }

  async login(
    phoneNumber: string,
    telegramUserId: number,
    telegramUsername?: string,
  ): Promise<LoginResponse> {
    try {
      const response = await this.client.post<ApiResponse<LoginResponse>>('/auth/telegram/login', {
        phone: phoneNumber,
        telegramUserId,
        telegramUsername,
      });
      const { token, user } = response.data.data;
      this.setAuthToken(token);
      return { token, user };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async sendOtp(phoneNumber: string, telegramUserId: number): Promise<SendOtpResponse> {
    try {
      const response = await this.client.post<ApiResponse<SendOtpResponse>>(
        '/auth/telegram/send-otp',
        {
          phone: phoneNumber,
          telegramUserId,
        },
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async verifyOtp(
    phoneNumber: string,
    otp: string,
    telegramUserId: number,
    telegramUsername?: string,
  ): Promise<VerifyOtpResponse> {
    try {
      const response = await this.client.post<ApiResponse<VerifyOtpResponse>>(
        '/auth/telegram/verify-otp',
        {
          phone: phoneNumber,
          otp,
          telegramUserId,
          telegramUsername,
        },
      );
      const { token, user } = response.data.data;
      this.setAuthToken(token);
      return { token, user };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getCompanies(token: string): Promise<Company[]> {
    try {
      this.setAuthToken(token);
      const response = await this.client.get<ApiResponse<{ companies: Company[] }>>('/companies');
      return response.data.data.companies;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getFieldsByCompany(token: string, companyId: string): Promise<Field[]> {
    try {
      this.setAuthToken(token);
      const response = await this.client.get<ApiResponse<{ fields: Field[] }>>(
        `/fields/company/${companyId}`,
      );
      return response.data.data.fields;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getWarehousesByCompany(token: string, companyId: string): Promise<Warehouse[]> {
    try {
      this.setAuthToken(token);
      const response = await this.client.get<ApiResponse<{ warehouses: Warehouse[] }>>(
        `/warehouses/company/${companyId}`,
      );
      return response.data.data.warehouses;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getProductionUnits(token: string): Promise<ProductionUnit[]> {
    try {
      this.setAuthToken(token);
      const response = await this.client.get<ApiResponse<ProductionUnit[]>>('/production-units');
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async sendChatMessage(token: string, threadId: string, message: string): Promise<ChatResponse> {
    try {
      this.setAuthToken(token);
      const response = await this.client.post<ApiResponse<ChatResponse>>('/agent-chat/message', {
        threadId,
        message,
      });
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async approveChatAction(token: string, threadId: string): Promise<ChatResponse> {
    try {
      this.setAuthToken(token);
      const response = await this.client.post<ApiResponse<ChatResponse>>('/agent-chat/approve', {
        threadId,
      });
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async rejectChatAction(token: string, threadId: string, reason: string): Promise<ChatResponse> {
    try {
      this.setAuthToken(token);
      const response = await this.client.post<ApiResponse<ChatResponse>>('/agent-chat/reject', {
        threadId,
        reason,
      });
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async transcribeAudio(
    token: string,
    audioBuffer: Buffer,
    fileName: string,
  ): Promise<TranscriptionResponse> {
    try {
      this.setAuthToken(token);

      const formData = new FormData();
      formData.append('file', audioBuffer, {
        filename: fileName,
        contentType: 'audio/ogg',
      });
      formData.append('postProcess', 'true');

      const response = await this.client.post<ApiResponse<TranscriptionResponse>>(
        '/audio-to-text/transcribe',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${token}`,
          },
          timeout: 60000, // 60 seconds for audio processing
        },
      );

      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private handleError(error: unknown): Error {
    if (error instanceof AxiosError) {
      const message = error.response?.data?.message || error.response?.data?.error || error.message;
      return new Error(`API Error: ${message}`);
    }
    return error instanceof Error ? error : new Error('Unknown error');
  }
}

export const seminaiClient = new SeminaiClient();
