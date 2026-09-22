import { Patentino } from '../entities/Patentino';

export interface IPatentinoRepository {
  create(patentino: Patentino): Promise<Patentino>;
  findById(id: string): Promise<Patentino | null>;
  findByCode(code: string): Promise<Patentino | null>;
  findManyByUserId(userId: string): Promise<Patentino[]>;
  update(id: string, patentino: Partial<Patentino>): Promise<Patentino>;
  delete(id: string): Promise<void>;
}
