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
        this.apiKey = process.env.APPWRITE_API_KEY || '4a07df67cf37a01916b7d798be8d913f0e0adf022b6c61487230d914c1690038ca1294ef83a012d8f7414d56b9b047bb98a339de70ff641b583220edb2c258be6b09a004320f9d59a5dc5439c96accc72564d905e892b5aedc7a923f600aecd3be6bb82d817d753bd657ae1b87425b23202eab03e6e3e9492eb7e53b4b5f4d99';
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
