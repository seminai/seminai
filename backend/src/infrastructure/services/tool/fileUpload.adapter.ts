import { IFileUploadService } from '../../../application/use-cases/label/BulkExtractLabelsFromPdfFilesUseCase';
import { FileService } from '../FileService';
import { MulterFile } from '../Multer';

/**
 * Adapter for uploading files to Google Cloud Storage
 */
export class FileUploadAdapter implements IFileUploadService {
  async uploadPdfToStorage(buffer: Buffer, fileName: string, userId: string): Promise<string> {
    const fileService = new FileService();
    const multerFile: MulterFile = {
      fieldname: 'file',
      originalname: fileName,
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: buffer.length,
      buffer: buffer,
      destination: '',
      filename: fileName,
      path: '',
    };
    const publicUrl = await fileService.uploadFile(multerFile, userId, 'labels', 'pdf');
    return publicUrl;
  }
}
