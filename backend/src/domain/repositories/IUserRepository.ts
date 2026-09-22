import { User } from '../entities/User';

export interface IUserRepository {
  create(user: User): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  findByPhoneNumber(phoneNumber: string): Promise<User | null>;
  findByGoogleId(googleId: string): Promise<User | null>;
  update(id: string, user: Partial<User>): Promise<User>;
  delete(id: string): Promise<void>;
  deductCredits(userId: string, amount: number): Promise<User>;
}
