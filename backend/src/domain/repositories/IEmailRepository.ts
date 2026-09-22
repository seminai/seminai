import { ContactEmailDTO } from '../dtos/contact-email.dto';

/**
 * Contract for adapters capable of delivering email notifications.
 */
export interface IEmailRepository {
  /**
   * Forwards a contact message coming from the public endpoint to the internal support inbox.
   */
  sendContactEmail(payload: ContactEmailDTO): Promise<void>;
}
