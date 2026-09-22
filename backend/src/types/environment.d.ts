export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      PORT: string;
      DATABASE_URL: string;
      JWT_SECRET?: string;
      ENCRYPTION_SECRET?: string;
      DATA_DIR?: string;
      SETUP_COMPLETED?: string;
      LLM_GATEWAY?: string;
      OLLAMA_BASE_URL?: string;
      OPENAI_COMPATIBLE_BASE_URL?: string;
      OPENAI_COMPATIBLE_API_KEY?: string;
      ANTHROPIC_API_KEY?: string;
      LLM_EMBEDDING_MODEL?: string;
      ACCESS_MODE?: string;
      PUBLIC_BASE_URL?: string;
      TRUST_PROXY?: string;
      TAILSCALE_FUNNEL_URL?: string;
      CLOUDFLARE_TUNNEL_URL?: string;
      INVITE_CODE?: string;
      SMTP_HOST: string;
      SMTP_PORT: string;
      FRONTEND_URL: string;
      CORS_ORIGINS?: string;
      /** @deprecated Prefer CORS_ORIGINS; kept for backwards-compatible deploy envs */
      CORS_ORIGIN?: string;
      // Evolution API for WhatsApp integration
      EVOLUTION_API_URL?: string;
      EVOLUTION_API_KEY?: string;
      WHATSAPP_WEBHOOK_URL?: string; // URL where Evolution API sends webhooks (e.g., https://your-domain.com/webhooks/whatsapp)
      // BDF (Banca Dati Fitofarmaci) WS integration
      URL_SERVER_BDF?: string;
      USERNAME_BDF?: string;
      PASSWORD_BDF?: string;
      /**
       * When 'true', chat requests are routed to the agent matching the
       * workspace kind and `workspaceId` becomes required. Default (unset):
       * legacy behavior — always the dosage agent, `workspaceId` optional.
       */
      WORKSPACE_KIND_ROUTING?: 'true' | 'false';
    }
  }
}
