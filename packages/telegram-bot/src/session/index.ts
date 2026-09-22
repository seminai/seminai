import { SessionData } from '../types';

export function createInitialSession(): SessionData {
  return {
    pendingApproval: false,
    lastActivity: Date.now(),
  };
}

export function isAuthenticated(session: SessionData): boolean {
  return !!session.token && !!session.userId;
}

export function clearSession(session: SessionData): void {
  session.token = undefined;
  session.userId = undefined;
  session.userName = undefined;
  session.selectedCompanyId = undefined;
  session.selectedCompanyName = undefined;
  session.chatThreadId = undefined;
  session.pendingApproval = false;
  session.pendingPhone = undefined;
  session.pendingOtp = false;
  session.userEmail = undefined;
}

export function generateThreadId(chatId: number): string {
  return `telegram_${chatId}_${Date.now()}`;
}
