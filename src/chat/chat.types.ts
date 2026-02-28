// Shared TypeScript interfaces for Socket.IO payloads

export interface ChatUser {
    id: string;
    name: string;
    email: string;
}

export interface ChatMessagePayload {
    id: string;
    conversationId: string;
    tenantId: string;
    content: string;
    replyToMessageId?: string | null;
    sender: ChatUser;
    editedAt?: string | null;
    deletedAt?: string | null;
    createdAt: string;
}

export interface TypingPayload {
    conversationId: string;
    userId: string;
    userName: string;
}

export interface MarkReadPayload {
    conversationId: string;
    messageId: string;
}

export interface MessageReadBroadcast {
    conversationId: string;
    userId: string;
    messageId: string;
    readAt: string;
}

export interface UserPresencePayload {
    userId: string;
    tenantId: string;
}

export interface JoinLeavePayload {
    conversationId: string;
}

export interface ConversationWithMeta {
    id: string;
    tenantId: string;
    type: 'direct' | 'group';
    name?: string | null;
    description?: string | null;
    avatarUrl?: string | null;
    isArchived: boolean;
    lastMessageAt?: string | null;
    lastMessagePreview?: string | null;
    createdAt: string;
    updatedAt: string;
    members: ConversationMemberMeta[];
    unreadCount: number;
    lastReadMessageId?: string | null;
}

export interface ConversationMemberMeta {
    userId: string;
    name: string;
    email: string;
    isAdmin: boolean;
    joinedAt: string;
    leftAt?: string | null;
}
