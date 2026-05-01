import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';

@Injectable()
export class AppwriteStorageService {
    private readonly logger = new Logger(AppwriteStorageService.name);
    private readonly endpoint: string;
    private readonly projectId: string;
    private readonly apiKey: string;
    private readonly bucketId: string;

    constructor() {
        this.endpoint = process.env.APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
        this.projectId = process.env.APPWRITE_PROJECT_ID || '6982eb06003acf15de7d';
        this.apiKey = process.env.APPWRITE_API_KEY || 'standard_9d74e720772ce6eac44da4a3de3d81ee0145e8f2b3b441754c99d8fa796516cbb6c2de9baf6f23f6e81c99a18386e665fab2c0da206f63ec0dd2050259e6fcef6111663796c7874daa0a35c2696799d5e061dcbd6bc74ada221166f604bd1e04c2db9ab8fcfb531994eddcff89915f3370179c7c78549676f1d694c0eef15566';
        this.bucketId = process.env.APPWRITE_BUCKET_ID || '6982eb24001968dc38d4';

        if (!this.endpoint || !this.projectId || !this.apiKey || !this.bucketId) {
            this.logger.warn('Appwrite configuration missing. Uploads will fail.');
        }
    }

    async uploadFile(file: Express.Multer.File): Promise<{ fileIds: string; url: string }> {
        try {
            const formData = new FormData();
            
            // Create a unique but readable file ID that includes the extension
            const extension = file.originalname.split('.').pop() || 'file';
            const sanitizedName = file.originalname
                .split('.')[0]
                .replace(/[^a-zA-Z0-9]/g, '')
                .substring(0, 15);
            const uniquePart = Math.random().toString(36).substring(2, 10);
            const fileId = `${uniquePart}_${sanitizedName}.${extension}`.substring(0, 36);
            
            formData.append('fileId', fileId);

            // Convert buffer to stream for form-data
            const stream = Readable.from(file.buffer);
            formData.append('file', stream, { filename: file.originalname, contentType: file.mimetype });

            const response = await axios.post(
                `${this.endpoint}/storage/buckets/${this.bucketId}/files`,
                formData,
                {
                    headers: {
                        'X-Appwrite-Project': this.projectId,
                        'X-Appwrite-Key': this.apiKey,
                        ...formData.getHeaders(),
                    },
                },
            );

            const finalFileId = response.data.$id;
            // Append the original name to the URL as a query param to help with previews/identification
            const url = `${this.endpoint}/storage/buckets/${this.bucketId}/files/${finalFileId}/view?project=${this.projectId}&name=${encodeURIComponent(file.originalname)}`;

            return { fileIds: finalFileId, url };
        } catch (error) {
            this.logger.error('Appwrite upload failed', error);
            throw new InternalServerErrorException('Failed to upload file to storage');
        }
    }

    getFileViewUrl(fileId: string): string {
        return `${this.endpoint}/storage/buckets/${this.bucketId}/files/${fileId}/view?project=${this.projectId}`;
    }

    async getFileStream(fileId: string): Promise<{ stream: Readable; contentType: string }> {
        const url = this.getFileViewUrl(fileId);
        try {
            const response = await axios.get(url, { responseType: 'stream' });
            return {
                stream: response.data,
                contentType: response.headers['content-type'] || 'application/octet-stream',
            };
        } catch (error) {
            this.logger.error(`Failed to stream file ${fileId}`, error);
            throw new InternalServerErrorException('Failed to fetch file from storage');
        }
    }
}
