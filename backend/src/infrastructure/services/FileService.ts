import { Storage } from '@google-cloud/storage';
import { Readable } from 'stream';
import path from 'path';
import fs from 'fs';
import { MulterFile } from './Multer';

export interface FileInfo {
  url: string;
  name: string;
  type: string;
  path?: string;
}

export class FileService {
  private storage: Storage;
  private bucket: string;
  private userId?: string;

  constructor(userId?: string) {
    const keyFilePath = path.resolve(process.cwd(), 'key_gcp.json');

    this.storage = new Storage({
      projectId: 'seminai',
      keyFilename: keyFilePath,
    });
    this.bucket = process.env.GCP_BUCKET_NAME || 'seminai-storage';
    this.userId = userId;
    if (process.env.NODE_ENV !== 'test') {
      this.validateBucket().catch((err) => {
        console.error(`ATTENZIONE: Errore nell'accesso al bucket: ${err.message}`);
      });
    }
  }

  /**
   * Verifica che il bucket esista e sia accessibile
   * @private
   */
  private async validateBucket(): Promise<void> {
    try {
      const [exists] = await this.storage.bucket(this.bucket).exists();
      if (!exists) {
        console.error(`ERRORE CRITICO: Il bucket ${this.bucket} non esiste!`);
        console.error('Verifica le credenziali e le impostazioni di GCP.');
      }
    } catch (error) {
      console.error(`Errore durante la verifica del bucket: ${error.message}`);
      throw error;
    }
  }

  /**
   * Carica un file su Google Cloud Storage e restituisce l'URL pubblico
   * @param file File da caricare
   * @param userId ID dell'utente
   * @param path Percorso di destinazione
   * @param type Tipo di file
   * @returns URL pubblico del file caricato
   */
  public async uploadFile(
    file: MulterFile,
    userId: string,
    path: string,
    type: string,
  ): Promise<string> {
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 10000);
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');

    const uniqueFileName = `${userId}/${path}/${timestamp}_${randomSuffix}_${cleanName}`;

    const bucket = this.storage.bucket(this.bucket);
    const blob = bucket.file(uniqueFileName);

    const MAX_RETRIES = 3;
    let retryCount = 0;
    let lastError = null;

    while (retryCount < MAX_RETRIES) {
      try {
        const blobStream = blob.createWriteStream({
          resumable: false,
          metadata: {
            contentType: file.mimetype,
            metadata: {
              userId: userId,
              type: type,
            },
          },
        });

        return await new Promise<string>((resolve, reject) => {
          blobStream.on('error', (err: Error) => {
            console.warn(`Errore durante il tentativo ${retryCount + 1}:`, err);
            reject(err);
          });

          blobStream.on('finish', async () => {
            try {
              const [policy] = await bucket.iam.getPolicy({
                requestedPolicyVersion: 3,
              });

              policy.version = 3;
              policy.bindings = policy.bindings || [];

              const publicAccessPolicy = policy.bindings.find(
                (binding: { role: string; members?: string[] }) =>
                  binding.role === 'roles/storage.objectViewer' &&
                  binding.members &&
                  binding.members.includes('allUsers'),
              );

              if (!publicAccessPolicy) {
                policy.bindings.push({
                  role: 'roles/storage.objectViewer',
                  members: ['allUsers'],
                });

                try {
                  await bucket.iam.setPolicy(policy);
                } catch (policyError) {
                  console.warn("Errore nell'impostazione della policy, ma continuo:", policyError);
                }
              }

              const publicUrl = `https://storage.googleapis.com/${this.bucket}/${uniqueFileName}`;
              resolve(publicUrl);
            } catch (err) {
              console.error(`Errore nella configurazione dell'accesso pubblico: ${err.message}`);
              const publicUrl = `https://storage.googleapis.com/${this.bucket}/${uniqueFileName}`;
              resolve(publicUrl);
            }
          });

          blobStream.end(file.buffer);
        });
      } catch (error) {
        lastError = error;
        retryCount++;

        console.error(`Tentativo ${retryCount}/${MAX_RETRIES} fallito con errore:`, error.message);

        if (retryCount < MAX_RETRIES) {
          const waitTime = Math.pow(2, retryCount) * 100;
          console.log(`Attendo ${waitTime}ms prima di riprovare...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    throw (
      lastError ||
      new Error(
        `Impossibile caricare il file dopo ${MAX_RETRIES} tentativi. Verifica le credenziali GCP e le impostazioni del bucket.`,
      )
    );
  }

  /**
   * Recupera un file da un URL (supporta GCS e file locali per test)
   * @param url URL del file (https://storage.googleapis.com/... o file://...)
   * @returns File Multer
   */
  public async getFileFromUrl(url: string): Promise<MulterFile> {
    try {
      if (!url) {
        throw new Error('URL non fornito');
      }

      // Supporto per file locali (utile per test e sviluppo)
      if (url.startsWith('file://')) {
        const localPath = url.replace('file://', '');

        if (!fs.existsSync(localPath)) {
          throw new Error(`File locale non trovato: ${localPath}`);
        }

        const buffer = fs.readFileSync(localPath);
        const fileName = path.basename(localPath);
        const ext = path.extname(localPath).toLowerCase();
        // Determina il MIME type basato sull'estensione
        const mimeTypes: Record<string, string> = {
          '.pdf': 'application/pdf',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.txt': 'text/plain',
        };
        const mimetype = mimeTypes[ext] || 'application/octet-stream';
        const multerFile: MulterFile = {
          fieldname: 'file',
          originalname: fileName,
          encoding: '7bit',
          mimetype: mimetype,
          size: buffer.length,
          destination: path.dirname(localPath),
          filename: fileName,
          path: localPath,
          buffer: buffer,
          stream: Readable.from(buffer),
        } as MulterFile;
        console.log(`[FileService] Loaded local file: ${localPath} (${buffer.length} bytes)`);
        return multerFile;
      }
      const gsPath = url.replace(`https://storage.googleapis.com/${this.bucket}/`, '');
      const bucket = this.storage.bucket(this.bucket);
      const file = bucket.file(gsPath);
      const [exists] = await file.exists();
      if (!exists) {
        throw new Error(`File non trovato: ${gsPath}`);
      }
      const [metadata] = await file.getMetadata();
      const stream = file.createReadStream();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      for await (const chunk of stream) {
        chunks.push(Uint8Array.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      const multerFile: MulterFile = {
        fieldname: 'file',
        originalname: gsPath.split('/').pop() || gsPath,
        encoding: '7bit',
        mimetype: metadata.contentType || 'application/octet-stream',
        size: parseInt(`${metadata.size}`),
        destination: this.bucket,
        filename: gsPath.split('/').pop() || gsPath,
        path: gsPath,
        buffer: buffer,
        stream: Readable.from(buffer),
      } as MulterFile;
      return multerFile;
    } catch (error) {
      console.error('Errore nel recupero del file da GCS:', error);
      throw error;
    }
  }
  /**
   * Elimina un file dal cloud storage
   * @param fileUrl URL del file da eliminare
   */
  public async deleteFile(fileUrl: string): Promise<void> {
    try {
      const gsPath = fileUrl.replace(`https://storage.googleapis.com/${this.bucket}/`, '');
      const bucket = this.storage.bucket(this.bucket);
      await bucket.file(gsPath).delete();
    } catch (error) {
      throw new Error(`Errore nell'eliminazione del file: ${error.message}`);
    }
  }
  /**
   * Ottiene tutti i file di un utente in una directory specifica
   * @param path Percorso opzionale per filtrare i file
   * @returns Lista di file con i relativi metadati
   */
  public async getUserFiles(path?: string): Promise<
    Array<{
      name: string;
      url: string;
      metadata: {
        userId: string;
        type: string;
      };
    }>
  > {
    if (!this.userId) {
      throw new Error('userId non fornito');
    }
    const bucket = this.storage.bucket(this.bucket);
    let prefix: string;
    if (path) {
      prefix = `${this.userId}/${path}/`;
    } else {
      prefix = `${this.userId}/`;
    }
    try {
      const [files] = await bucket.getFiles({
        prefix: prefix,
      });
      const fileList = await Promise.all(
        files.map(async (file) => {
          const [metadata] = await file.getMetadata();
          const customMetadata = metadata.metadata as {
            userId: string;
            type: string;
          };
          return {
            name: file.name.split('/').pop() || '',
            url: `https://storage.googleapis.com/${this.bucket}/${file.name}`,
            metadata: customMetadata,
          };
        }),
      );
      return fileList;
    } catch (error) {
      console.error('Errore nel recupero dei file:', error);
      throw error;
    }
  }
}
