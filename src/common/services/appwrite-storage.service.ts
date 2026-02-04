import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import axios from 'axios';
import * as FormData from 'form-data';
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
            formData.append('fileId', 'unique()');

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

            const fileId = response.data.$id;
            const url = `${this.endpoint}/storage/buckets/${this.bucketId}/files/${fileId}/view?project=${this.projectId}`;

            return { fileIds: fileId, url };
        } catch (error) {
            this.logger.error('Appwrite upload failed', error);
            throw new InternalServerErrorException('Failed to upload file to storage');
        }
    }
}
