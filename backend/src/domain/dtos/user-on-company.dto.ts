import { CompanyRole } from '@prisma/client';

/**
 * DTO for UserOnCompany enriched with User and Company data
 */
export interface UserOnCompanyWithDetailsDTO {
  id: string;
  companyId: string;
  userId: string;
  type: string | null;
  role: CompanyRole;
  user: {
    id: string;
    name: string;
    email: string;
    surname: string | null;
    phoneNumber: string | null;
    profilePictureUrl: string | null;
    lastAccessAt: Date | null;
    invitationPending: boolean;
  };
  company: {
    id: string;
    name: string;
    email: string | null;
    vatNumber: string;
    fiscalCode: string;
  };
}

/**
 * DTO for Company enriched with UserOnCompany and User data
 */
export interface CompanyWithDetailsDTO {
  id: string;
  companyId: string;
  userId: string;
  type: string | null;
  role: CompanyRole;
  company: {
    id: string;
    name: string;
    email: string | null;
    vatNumber: string;
    fiscalCode: string;
    city: string | null;
    address: string | null;
    phoneNumber: string | null;
    website: string | null;
    logoUrl: string | null;
  };
}
