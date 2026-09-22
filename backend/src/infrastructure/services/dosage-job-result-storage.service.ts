import { FileService } from './FileService';
import { MulterFile } from './Multer';

export interface StoredJobResultReference {
  readonly storage: 'file';
  readonly url: string;
  readonly sizeMb: number;
}

/**
 * Stores large dosage job results outside Redis to avoid Upstash max request size limits.
 */
export class DosageJobResultStorageService {
  private readonly fileService: FileService;

  constructor() {
    this.fileService = new FileService();
  }

  /**
   * Stores a JSON payload and returns a lightweight reference.
   */
  public async storeJsonResult(params: {
    readonly userId: string;
    readonly jobId: string;
    readonly json: string;
  }): Promise<StoredJobResultReference> {
    const buffer = Buffer.from(params.json, 'utf8');
    const fileName = `dosage-job-${params.jobId}.json`;
    const multerFile: MulterFile = {
      fieldname: 'file',
      originalname: fileName,
      encoding: '7bit',
      mimetype: 'application/json',
      size: buffer.length,
      buffer,
      destination: '',
      filename: fileName,
      path: '',
    };
    const url = await this.fileService.uploadFile(
      multerFile,
      params.userId,
      'dosage-results',
      'json',
    );
    return {
      storage: 'file',
      url,
      sizeMb: buffer.length / 1024 / 1024,
    };
  }
}
