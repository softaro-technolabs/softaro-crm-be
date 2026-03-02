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

        /**
         * Backward compatibility: Support both Hex (legacy) and Base64 (new).
         * Hex encodings (IV 16b, Tag 16b) are 32 chars.
         * Base64 encodings are typically 24 chars (including padding).
         */
        const isHex = (str: string) => /^[0-9a-fA-F]+$/.test(str);

        const ivEncoding = parts[0].length === 32 && isHex(parts[0]) ? 'hex' : 'base64';
        const authTagEncoding = parts[1].length === 32 && isHex(parts[1]) ? 'hex' : 'base64';
        // For the ciphertext, we can check if it looks like hex and has an even length
        const encryptedTextEncoding =
            parts[2].length % 2 === 0 && isHex(parts[2]) && !parts[2].includes('=')
                ? 'hex'
                : 'base64';

        const iv = Buffer.from(parts[0], ivEncoding);
        const authTag = Buffer.from(parts[1], authTagEncoding);
        const encryptedText = Buffer.from(parts[2], encryptedTextEncoding);

        try {
            const decipher = crypto.createDecipheriv(this.algorithm, this.secretKey, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(encryptedText, undefined, 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            console.error('EncryptionService: Decryption failed. Possible key mismatch or data corruption.', (error as any).message);
            throw new Error('EncryptionService: Decryption failed. Please reconnect the account to refresh the token.');
        }
    }
}
