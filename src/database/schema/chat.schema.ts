import {
    pgTable,
    varchar,
    timestamp,
    boolean,
    pgEnum,
    text,
    index,
    integer
} from 'drizzle-orm/pg-core';

// ─── Enums ──────────────────────────────────────────────
export const conversationTypeEnum = pgEnum('conversation_type', ['direct', 'group']);
export const messageStatusEnum = pgEnum('message_status', ['sent', 'delivered', 'read']);

// ─── Conversations ───────────────────────────────────────
export const chatConversations = pgTable(
    'chat_conversations',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        tenantId: varchar('tenant_id', { length: 36 }).notNull(),
        type: conversationTypeEnum('type').notNull().default('direct'),
        name: varchar('name', { length: 255 }), // null for DM, set for groups
        description: varchar('description', { length: 1000 }),
        avatarUrl: varchar('avatar_url', { length: 500 }),
        createdByUserId: varchar('created_by_user_id', { length: 36 }).notNull(),
        lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
        lastMessagePreview: varchar('last_message_preview', { length: 255 }),
        isArchived: boolean('is_archived').notNull().default(false),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
    },
    (t) => ({
        tenantIdx: index('chat_conversations_tenant_idx').on(t.tenantId),
        tenantLastMsgIdx: index('chat_conversations_tenant_last_msg_idx').on(t.tenantId, t.lastMessageAt)
    })
);

// ─── Conversation Members ─────────────────────────────────
export const chatMembers = pgTable(
    'chat_members',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        conversationId: varchar('conversation_id', { length: 36 }).notNull(),
        userId: varchar('user_id', { length: 36 }).notNull(),
        tenantId: varchar('tenant_id', { length: 36 }).notNull(),
        isAdmin: boolean('is_admin').notNull().default(false),
        joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
        leftAt: timestamp('left_at', { withTimezone: true }),         // null = still member
        addedByUserId: varchar('added_by_user_id', { length: 36 })
    },
    (t) => ({
        convUserIdx: index('chat_members_conv_user_idx').on(t.conversationId, t.userId),
        userIdx: index('chat_members_user_idx').on(t.userId, t.tenantId)
    })
);

// ─── Messages ─────────────────────────────────────────────
export const chatMessages = pgTable(
    'chat_messages',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        conversationId: varchar('conversation_id', { length: 36 }).notNull(),
        tenantId: varchar('tenant_id', { length: 36 }).notNull(),
        senderUserId: varchar('sender_user_id', { length: 36 }).notNull(),
        content: text('content').notNull(),
        replyToMessageId: varchar('reply_to_message_id', { length: 36 }), // quoted reply
        editedAt: timestamp('edited_at', { withTimezone: true }),
        deletedAt: timestamp('deleted_at', { withTimezone: true }),       // soft-delete
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
    },
    (t) => ({
        convCreatedIdx: index('chat_messages_conv_created_idx').on(t.conversationId, t.createdAt),
        tenantConvIdx: index('chat_messages_tenant_conv_idx').on(t.tenantId, t.conversationId),
        senderIdx: index('chat_messages_sender_idx').on(t.senderUserId)
    })
);

// ─── Message Reads ────────────────────────────────────────
export const chatMessageReads = pgTable(
    'chat_message_reads',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        conversationId: varchar('conversation_id', { length: 36 }).notNull(),
        userId: varchar('user_id', { length: 36 }).notNull(),
        tenantId: varchar('tenant_id', { length: 36 }).notNull(),
        lastReadMessageId: varchar('last_read_message_id', { length: 36 }).notNull(),
        readAt: timestamp('read_at', { withTimezone: true }).defaultNow().notNull()
    },
    (t) => ({
        convUserIdx: index('chat_message_reads_conv_user_idx').on(t.conversationId, t.userId),
        userTenantIdx: index('chat_message_reads_user_tenant_idx').on(t.userId, t.tenantId)
    })
);
