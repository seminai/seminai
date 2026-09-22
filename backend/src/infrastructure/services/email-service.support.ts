export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}


export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}
