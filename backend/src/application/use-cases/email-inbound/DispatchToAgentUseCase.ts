import { Chat, ChatCategory } from '../../../domain/entities/Chat';
import { type DispatchToAgentResultDto } from '../../../domain/dtos/email-inbound.dto';
import { type IChatRepository } from '../../../domain/repositories/IChatRepository';
import { type ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { type IUserRepository } from '../../../domain/repositories/IUserRepository';
import {
  createReactAgent,
  handleUserMessage,
} from '../../../infrastructure/services/agents/dosage_agent_react/DosageReactAgent';
import { updateWorkingMemory } from '../../../infrastructure/services/agents/dosage_agent_react/working-memory';
import { isCommercialOrderEmail } from './commercial-intent';

interface DispatchAttachmentInput {
  readonly buffer: Buffer;
  readonly fileName: string;
  readonly mimeType: string;
}

interface DispatchToAgentInput {
  readonly userId: string;
  readonly companyId: string;
  readonly emailIngestionId: string;
  readonly subject: string;
  readonly bodyText: string;
  readonly attachments: ReadonlyArray<DispatchAttachmentInput>;
}

const THREAD_PREFIX = 'email-ingest';
const MAX_BODY_PREVIEW = 2_000;

/**
 * Creates a fresh ephemeral thread per inbound email and dispatches it
 * to dosage_agent_react. The agent requires approval for destructive tools,
 * so the response typically returns REQUIRES_APPROVAL — the user resolves
 * the pending action in the webapp via the link sent in the confirmation email.
 */
export class DispatchToAgentUseCase {
  constructor(
    private readonly chatRepository: IChatRepository,
    private readonly userRepository: IUserRepository,
    private readonly companyRepository: ICompanyRepository,
  ) {}

  async execute(input: DispatchToAgentInput): Promise<DispatchToAgentResultDto> {
    const user = await this.userRepository.findById(input.userId);
    const company = await this.companyRepository.findById(input.companyId);
    if (!user || !company) {
      throw new Error(`Dispatch failed: user=${Boolean(user)} company=${Boolean(company)}`);
    }
    const threadId = this.buildThreadId(input.userId, input.companyId);
    const chat = await this.ensureChat({
      threadId,
      userId: input.userId,
      emailIngestionId: input.emailIngestionId,
    });
    const attachmentNames = input.attachments.map((a) => a.fileName);
    const isCommercial = isCommercialOrderEmail({ subject: input.subject, attachmentNames });
    this.hydrateWorkingMemory(
      threadId,
      input.attachments,
      isCommercial ? input.emailIngestionId : undefined,
    );
    const app = await createReactAgent({
      threadId,
      userId: input.userId,
      requireApproval: true,
      userInfo: { name: this.formatUserName(user.name, user.surname), email: user.email },
    });
    const userMessage = this.buildUserMessage({
      subject: input.subject,
      bodyText: input.bodyText,
      companyName: company.name,
      companyId: company.id,
      attachmentNames,
      isCommercial,
    });
    const response = await handleUserMessage(app, threadId, userMessage);
    return { threadId, chatId: chat.id, agentStatus: response.status };
  }

  private buildThreadId(userId: string, companyId: string): string {
    const shortUser = userId.slice(0, 8);
    const shortCompany = companyId.slice(0, 8);
    const nonce = Math.random().toString(36).slice(2, 10);
    return `${THREAD_PREFIX}:${shortUser}:${shortCompany}:${nonce}`;
  }

  private async ensureChat(input: EnsureChatInput): Promise<Chat> {
    const existing = await this.chatRepository.findByThreadId(input.threadId);
    if (existing) return existing;
    return this.chatRepository.create(
      Chat.create({
        userId: input.userId,
        threadId: input.threadId,
        category: ChatCategory.DOSAGE_AGENT,
        metadata: { source: 'email', emailIngestionId: input.emailIngestionId },
      }),
    );
  }

  private hydrateWorkingMemory(
    threadId: string,
    attachments: ReadonlyArray<DispatchAttachmentInput>,
    commercialIngestionId?: string,
  ): void {
    if (attachments.length === 0) return;
    const [first] = attachments;
    updateWorkingMemory(threadId, {
      uploadedFiles: attachments,
      uploadedFileBuffer: first.buffer,
      uploadedFileName: first.fileName,
      uploadedFileMimeType: first.mimeType,
      ...(commercialIngestionId
        ? { commercialSource: { channel: 'email' as const, ingestionId: commercialIngestionId } }
        : {}),
    });
  }

  private formatUserName(name: string, surname?: string | null): string {
    return surname ? `${name} ${surname}` : name;
  }

  private buildUserMessage(input: BuildUserMessageInput): string {
    const bodyPreview = input.bodyText.slice(0, MAX_BODY_PREVIEW).trim() || '(no body text)';
    const fileList = input.attachmentNames.map((name, index) => `${index + 1}. ${name}`).join('\n');
    const header = [
      `Ho ricevuto questa email con ${input.attachmentNames.length} allegato/i.`,
      `Subject: "${input.subject}"`,
      `Body utente:\n"""\n${bodyPreview}\n"""`,
      `Azienda di riferimento: ${input.companyName} (id: ${input.companyId}).`,
      `File allegati:\n${fileList}`,
    ];
    const instructions = input.isCommercial
      ? [
          "Questo è un ORDINE cliente. Usa preview_order_template per l'anteprima, poi import_sales_order_from_template (richiede approvazione): il cliente viene abbinato o CREATO automaticamente dall'anagrafica.",
          "Se l'utente lo chiede, genera la proforma con generate_proforma. NON usare extract_from_file/import_from_file (quelli sono per magazzino/agronomia).",
        ]
      : [
          'Esamina gli allegati con extract_from_file e proponi le azioni opportune.',
          "Se i dati sono anagrafici, agricoli o di magazzino, dopo l'anteprima usa import_from_file (richiede approvazione utente).",
        ];
    return [...header, ...instructions].join('\n\n');
  }
}

interface EnsureChatInput {
  readonly threadId: string;
  readonly userId: string;
  readonly emailIngestionId: string;
}

interface BuildUserMessageInput {
  readonly subject: string;
  readonly bodyText: string;
  readonly companyName: string;
  readonly companyId: string;
  readonly attachmentNames: ReadonlyArray<string>;
  readonly isCommercial: boolean;
}
