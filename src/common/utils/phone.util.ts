/**
 * Utility for handling phone number normalization and formatting
 */
export class PhoneUtil {
    /**
     * Normalizes a phone number by removing all non-numeric characters.
     * If the number starts with '+', it preserves the intention of an international number
     * but still strips all symbols. Most WhatsApp APIs expect the format "CCXXXXXXXXXX".
     * 
     * @param phone The raw phone number string
     * @returns A normalized numeric string or null if empty
     */
    static normalize(phone: string | null | undefined): string | null {
        if (!phone) {
            return null;
        }

        // Remove all non-numeric characters
        const normalized = phone.replace(/\D/g, '');

        return normalized.length > 0 ? normalized : null;
    }

    /**
     * Compares two phone numbers after normalization
     */
    static compare(phone1: string | null | undefined, phone2: string | null | undefined): boolean {
        const norm1 = this.normalize(phone1);
        const norm2 = this.normalize(phone2);

        if (!norm1 || !norm2) {
            return false;
        }

        return norm1 === norm2;
    }
}
