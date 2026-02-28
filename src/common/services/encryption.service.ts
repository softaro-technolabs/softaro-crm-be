import * as crypto from 'crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EncryptionService {
    private readonly algorithm = 'aes-256-gcm';
    private readonly keyLength = 32;
    private readonly ivLength = 16;
    private readonly authTagLength = 16;
    private secretKey: Buffer;

    constructor(private configService: ConfigService) {
        const rawKey = this.configService.get<string>('ENCRYPTION_KEY');
        if (!rawKey) {
            throw new Error('ENCRYPTION_KEY environment variable is not set');
        }

        // Ensure the key is exactly 32 bytes (256 bits)
        if (Buffer.from(rawKey, 'utf8').length === this.keyLength) {
            this.secretKey = Buffer.from(rawKey, 'utf8');
        } else {
            // If it's a hex string (e.g. from crypto.randomBytes(32).toString('hex')), it's 64 chars
            if (rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)) {
                this.secretKey = Buffer.from(rawKey, 'hex');
            } else {
                // Fallback: derive a 32-byte key using sha256
                this.secretKey = crypto.createHash('sha256').update(rawKey).digest();
            }
        }
    }

    encrypt(text: string): string {
        const iv = crypto.randomBytes(this.ivLength);
        const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);

        let encrypted = cipher.update(text, 'utf8', 'base64');
        encrypted += cipher.final('base64');

        const authTag = cipher.getAuthTag();

        // Format: iv:authTag:encryptedText
        return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
    }

    decrypt(encryptedData: string): string {
        const parts = encryptedData.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid encrypted text format');
        }

        const iv = Buffer.from(parts[0], 'base64');
        const authTag = Buffer.from(parts[1], 'base64');
        const encryptedText = Buffer.from(parts[2], 'base64');

        const decipher = crypto.createDecipheriv(this.algorithm, this.secretKey, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedText, undefined, 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }
}
