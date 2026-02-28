import {
    Injectable,
    Inject,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
    Logger
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, desc, lt, inArray, isNull, sql, ne } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import * as schema from '../database/schema';
import {
    chatConversations,
    chatMembers,
    chatMessages,
    chatMessageReads
} from '../database/schema/chat.schema';
import {
    CreateConversationDto,
    SendMessageDto,
    UpdateGroupDto,
    AddMemberDto
} from './chat.dto';
import type {
    ChatMessagePayload,
    ConversationWithMeta,
    ConversationMemberMeta
} from './chat.types';

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);

    constructor(
        @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>
    ) { }

    // ─────────────────────────────────────────────────────────────────
    // CONVERSATIONS
    // ─────────────────────────────────────────────────────────────────

    async createConversation(
        tenantId: string,
        creatorUserId: string,
        dto: CreateConversationDto
    ) {
        // Validate group name
        if (dto.type === 'group' && !dto.name?.trim()) {
            throw new BadRequestException('Group name is required');
        }

        // For DMs: check if a DM already exists between these two users
        if (dto.type === 'direct') {
            if (dto.memberUserIds.length !== 1) {
                throw new BadRequestException('Direct message must have exactly one other member');
            }
            const otherUserId = dto.memberUserIds[0];
            const existing = await this.findExistingDm(tenantId, creatorUserId, otherUserId);
            if (existing) {
                return existing;
            }
        }

        const convId = randomUUID();
        const now = new Date();

        // Create conversation
        await this.db.insert(chatConversations).values({
            id: convId,
            tenantId,
            type: dto.type,
            name: dto.name?.trim() ?? null,
            description: dto.description?.trim() ?? null,
            createdByUserId: creatorUserId,
            createdAt: now,
            updatedAt: now
        });

        // Add creator as admin member
        await this.db.insert(chatMembers).values({
            id: randomUUID(),
            conversationId: convId,
            userId: creatorUserId,
            tenantId,
            isAdmin: true,
            joinedAt: now,
            addedByUserId: creatorUserId
        });

        // Add other members
        const memberInserts = dto.memberUserIds
            .filter((id) => id !== creatorUserId)
            .map((userId) => ({
                id: randomUUID(),
                conversationId: convId,
                userId,
                tenantId,
                isAdmin: false,
                joinedAt: now,
                addedByUserId: creatorUserId
            }));

        if (memberInserts.length > 0) {
            await this.db.insert(chatMembers).values(memberInserts);
        }

        return this.getConversationById(tenantId, creatorUserId, convId);
    }

    async getConversations(tenantId: string, userId: string): Promise<ConversationWithMeta[]> {
        // Get all active member records for this user in this tenant
        const memberRows = await this.db
            .select()
            .from(chatMembers)
            .where(
                and(
                    eq(chatMembers.tenantId, tenantId),
                    eq(chatMembers.userId, userId),
                    isNull(chatMembers.leftAt)
                )
            );

        if (memberRows.length === 0) return [];

        const convIds = memberRows.map((m) => m.conversationId);

        const conversations = await this.db
            .select()
            .from(chatConversations)
            .where(
                and(
                    inArray(chatConversations.id, convIds),
                    eq(chatConversations.tenantId, tenantId)
                )
            )
            .orderBy(desc(chatConversations.lastMessageAt));

        // Fetch all members + their users for these conversations (batch)
        const allMembers = await this.db
            .select({
                conversationId: chatMembers.conversationId,
                userId: chatMembers.userId,
                isAdmin: chatMembers.isAdmin,
                joinedAt: chatMembers.joinedAt,
                leftAt: chatMembers.leftAt,
                userName: schema.users.name,
                userEmail: schema.users.email
            })
            .from(chatMembers)
            .innerJoin(schema.users, eq(chatMembers.userId, schema.users.id))
            .where(inArray(chatMembers.conversationId, convIds));

        // Fetch read receipts for current user
        const readReceipts = await this.db
            .select()
            .from(chatMessageReads)
            .where(
                and(
                    eq(chatMessageReads.userId, userId),
                    eq(chatMessageReads.tenantId, tenantId),
                    inArray(chatMessageReads.conversationId, convIds)
                )
            );
        const readMap = new Map(readReceipts.map((r) => [r.conversationId, r]));

        // Fetch unread counts
        const unreadCounts = await this.getUnreadCounts(convIds, userId, tenantId, readMap);

        // Build member map
        const memberMap = new Map<string, ConversationMemberMeta[]>();
        for (const m of allMembers) {
            if (!memberMap.has(m.conversationId)) memberMap.set(m.conversationId, []);
            memberMap.get(m.conversationId)!.push({
                userId: m.userId,
                name: m.userName,
                email: m.userEmail,
                isAdmin: m.isAdmin,
                joinedAt: m.joinedAt.toISOString(),
                leftAt: m.leftAt?.toISOString() ?? null
            });
        }

        return conversations.map((conv) => ({
            id: conv.id,
            tenantId: conv.tenantId,
            type: conv.type,
            name: conv.name,
            description: conv.description,
            avatarUrl: conv.avatarUrl,
            isArchived: conv.isArchived,
            lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
            lastMessagePreview: conv.lastMessagePreview,
            createdAt: conv.createdAt.toISOString(),
            updatedAt: conv.updatedAt.toISOString(),
            members: memberMap.get(conv.id) ?? [],
            unreadCount: unreadCounts.get(conv.id) ?? 0,
            lastReadMessageId: readMap.get(conv.id)?.lastReadMessageId ?? null
        }));
    }

    async getConversationById(
        tenantId: string,
        userId: string,
        conversationId: string
    ): Promise<ConversationWithMeta> {
        const conv = await this.db
            .select()
            .from(chatConversations)
            .where(
                and(
                    eq(chatConversations.id, conversationId),
                    eq(chatConversations.tenantId, tenantId)
                )
            )
            .limit(1);

        if (!conv.length) throw new NotFoundException('Conversation not found');

        // Check membership
        await this.assertMember(conversationId, userId, tenantId);

        const members = await this.db
            .select({
                userId: chatMembers.userId,
                isAdmin: chatMembers.isAdmin,
                joinedAt: chatMembers.joinedAt,
                leftAt: chatMembers.leftAt,
                userName: schema.users.name,
                userEmail: schema.users.email
            })
            .from(chatMembers)
            .innerJoin(schema.users, eq(chatMembers.userId, schema.users.id))
            .where(eq(chatMembers.conversationId, conversationId));

        const readReceipt = await this.db
            .select()
            .from(chatMessageReads)
            .where(
                and(
                    eq(chatMessageReads.conversationId, conversationId),
                    eq(chatMessageReads.userId, userId)
                )
            )
            .limit(1);

        const readMap = new Map([[conversationId, readReceipt[0]]]);
        const unreadCounts = await this.getUnreadCounts([conversationId], userId, tenantId, readMap);
        const c = conv[0];

        return {
            id: c.id,
            tenantId: c.tenantId,
            type: c.type,
            name: c.name,
            description: c.description,
            avatarUrl: c.avatarUrl,
            isArchived: c.isArchived,
            lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
            lastMessagePreview: c.lastMessagePreview,
            createdAt: c.createdAt.toISOString(),
            updatedAt: c.updatedAt.toISOString(),
            members: members.map((m) => ({
                userId: m.userId,
                name: m.userName,
                email: m.userEmail,
                isAdmin: m.isAdmin,
                joinedAt: m.joinedAt.toISOString(),
                leftAt: m.leftAt?.toISOString() ?? null
            })),
            unreadCount: unreadCounts.get(conversationId) ?? 0,
            lastReadMessageId: readReceipt[0]?.lastReadMessageId ?? null
        };
    }

    async updateGroup(
        tenantId: string,
        userId: string,
        conversationId: string,
        dto: UpdateGroupDto
    ) {
        const conv = await this.assertGroup(conversationId, tenantId);
        await this.assertAdmin(conversationId, userId, tenantId);

        await this.db
            .update(chatConversations)
            .set({
                name: dto.name?.trim() ?? conv.name,
                description: dto.description?.trim() ?? conv.description,
                updatedAt: new Date()
            })
            .where(
                and(
                    eq(chatConversations.id, conversationId),
                    eq(chatConversations.tenantId, tenantId)
                )
            );

        return this.getConversationById(tenantId, userId, conversationId);
    }

    // ─────────────────────────────────────────────────────────────────
    // MEMBERS
    // ─────────────────────────────────────────────────────────────────

    async addMember(
        tenantId: string,
        requestingUserId: string,
        conversationId: string,
        dto: AddMemberDto
    ) {
        await this.assertGroup(conversationId, tenantId);
        await this.assertAdmin(conversationId, requestingUserId, tenantId);

        // Check if already a member (not left)
        const existing = await this.db
            .select()
            .from(chatMembers)
            .where(
                and(
                    eq(chatMembers.conversationId, conversationId),
                    eq(chatMembers.userId, dto.userId),
                    isNull(chatMembers.leftAt)
                )
            )
            .limit(1);

        if (existing.length > 0) {
            throw new BadRequestException('User is already a member of this conversation');
        }

        await this.db.insert(chatMembers).values({
            id: randomUUID(),
            conversationId,
            userId: dto.userId,
            tenantId,
            isAdmin: false,
            joinedAt: new Date(),
            addedByUserId: requestingUserId
        });

        return { success: true, message: 'Member added successfully' };
    }

    async removeMember(
        tenantId: string,
        requestingUserId: string,
        conversationId: string,
        userId: string
    ) {
        await this.assertGroup(conversationId, tenantId);

        // Can remove self, or admin can remove others
        if (requestingUserId !== userId) {
            await this.assertAdmin(conversationId, requestingUserId, tenantId);
        }

        await this.db
            .update(chatMembers)
            .set({ leftAt: new Date() })
            .where(
                and(
                    eq(chatMembers.conversationId, conversationId),
                    eq(chatMembers.userId, userId),
                    isNull(chatMembers.leftAt)
                )
            );

        return { success: true, message: 'Member removed successfully' };
    }

    // ─────────────────────────────────────────────────────────────────
    // MESSAGES
    // ─────────────────────────────────────────────────────────────────

    async getMessages(
        tenantId: string,
        userId: string,
        conversationId: string,
        cursor?: string,
        limit = 50
    ) {
        await this.assertMember(conversationId, userId, tenantId);

        const clampedLimit = Math.min(Math.max(limit, 1), 100);

        let whereClause = and(
            eq(chatMessages.conversationId, conversationId),
            eq(chatMessages.tenantId, tenantId),
            isNull(chatMessages.deletedAt)
        );

        if (cursor) {
            // Get the cursor message's created_at
            const cursorMsg = await this.db
                .select({ createdAt: chatMessages.createdAt })
                .from(chatMessages)
                .where(eq(chatMessages.id, cursor))
                .limit(1);

            if (cursorMsg.length > 0) {
                whereClause = and(
                    whereClause,
                    lt(chatMessages.createdAt, cursorMsg[0].createdAt)
                );
            }
        }

        const messages = await this.db
            .select({
                id: chatMessages.id,
                conversationId: chatMessages.conversationId,
                tenantId: chatMessages.tenantId,
                senderUserId: chatMessages.senderUserId,
                content: chatMessages.content,
                replyToMessageId: chatMessages.replyToMessageId,
                editedAt: chatMessages.editedAt,
                deletedAt: chatMessages.deletedAt,
                createdAt: chatMessages.createdAt,
                senderName: schema.users.name,
                senderEmail: schema.users.email
            })
            .from(chatMessages)
            .innerJoin(schema.users, eq(chatMessages.senderUserId, schema.users.id))
            .where(whereClause)
            .orderBy(desc(chatMessages.createdAt))
            .limit(clampedLimit + 1); // fetch one extra to detect more pages

        const hasMore = messages.length > clampedLimit;
        const result = hasMore ? messages.slice(0, clampedLimit) : messages;
        const nextCursor = hasMore ? result[result.length - 1].id : null;

        // Fetch read receipts for this conversation (everyone's)
        const reads = await this.db
            .select()
            .from(chatMessageReads)
            .where(eq(chatMessageReads.conversationId, conversationId));

        const readByMap = new Map<string, string[]>(); // messageId -> [userId]
        for (const read of reads) {
            if (!readByMap.has(read.lastReadMessageId)) readByMap.set(read.lastReadMessageId, []);
            readByMap.get(read.lastReadMessageId)!.push(read.userId);
        }

        return {
            messages: result.reverse().map((m) => ({
                id: m.id,
                conversationId: m.conversationId,
                tenantId: m.tenantId,
                content: m.content,
                replyToMessageId: m.replyToMessageId ?? null,
                editedAt: m.editedAt?.toISOString() ?? null,
                deletedAt: m.deletedAt?.toISOString() ?? null,
                createdAt: m.createdAt.toISOString(),
                sender: {
                    id: m.senderUserId,
                    name: m.senderName,
                    email: m.senderEmail
                },
                readBy: readByMap.get(m.id) ?? []
            })),
            pagination: {
                nextCursor,
                hasMore
            }
        };
    }

    async sendMessage(
        tenantId: string,
        userId: string,
        conversationId: string,
        dto: SendMessageDto
    ): Promise<ChatMessagePayload> {
        await this.assertMember(conversationId, userId, tenantId);

        const messageId = randomUUID();
        const now = new Date();

        await this.db.insert(chatMessages).values({
            id: messageId,
            conversationId,
            tenantId,
            senderUserId: userId,
            content: dto.content.trim(),
            replyToMessageId: dto.replyToMessageId ?? null,
            createdAt: now
        });

        // Update conversation last message
        const preview =
            dto.content.length > 100 ? dto.content.slice(0, 97) + '...' : dto.content;
        await this.db
            .update(chatConversations)
            .set({
                lastMessageAt: now,
                lastMessagePreview: preview,
                updatedAt: now
            })
            .where(
                and(
                    eq(chatConversations.id, conversationId),
                    eq(chatConversations.tenantId, tenantId)
                )
            );

        // Get sender info
        const sender = await this.db
            .select({ name: schema.users.name, email: schema.users.email })
            .from(schema.users)
            .where(eq(schema.users.id, userId))
            .limit(1);

        return {
            id: messageId,
            conversationId,
            tenantId,
            content: dto.content.trim(),
            replyToMessageId: dto.replyToMessageId ?? null,
            sender: {
                id: userId,
                name: sender[0]?.name ?? 'Unknown',
                email: sender[0]?.email ?? ''
            },
            editedAt: null,
            deletedAt: null,
            createdAt: now.toISOString()
        };
    }

    async deleteMessage(tenantId: string, userId: string, messageId: string) {
        const msg = await this.db
            .select()
            .from(chatMessages)
            .where(
                and(
                    eq(chatMessages.id, messageId),
                    eq(chatMessages.tenantId, tenantId)
                )
            )
            .limit(1);

        if (!msg.length) throw new NotFoundException('Message not found');

        if (msg[0].senderUserId !== userId) {
            // Admins can also delete
            const isAdmin = await this.db
                .select()
                .from(chatMembers)
                .where(
                    and(
                        eq(chatMembers.conversationId, msg[0].conversationId),
                        eq(chatMembers.userId, userId),
                        eq(chatMembers.isAdmin, true),
                        isNull(chatMembers.leftAt)
                    )
                )
                .limit(1);
            if (!isAdmin.length) throw new ForbiddenException('You cannot delete this message');
        }

        await this.db
            .update(chatMessages)
            .set({ deletedAt: new Date() })
            .where(eq(chatMessages.id, messageId));

        return { success: true, messageId, conversationId: msg[0].conversationId };
    }

    async markRead(
        tenantId: string,
        userId: string,
        conversationId: string,
        messageId: string
    ) {
        await this.assertMember(conversationId, userId, tenantId);

        const existing = await this.db
            .select()
            .from(chatMessageReads)
            .where(
                and(
                    eq(chatMessageReads.conversationId, conversationId),
                    eq(chatMessageReads.userId, userId)
                )
            )
            .limit(1);

        const now = new Date();

        if (existing.length > 0) {
            await this.db
                .update(chatMessageReads)
                .set({ lastReadMessageId: messageId, readAt: now })
                .where(
                    and(
                        eq(chatMessageReads.conversationId, conversationId),
                        eq(chatMessageReads.userId, userId)
                    )
                );
        } else {
            await this.db.insert(chatMessageReads).values({
                id: randomUUID(),
                conversationId,
                userId,
                tenantId,
                lastReadMessageId: messageId,
                readAt: now
            });
        }

        return { success: true, conversationId, messageId, readAt: now.toISOString() };
    }

    // ─────────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────────

    private async findExistingDm(tenantId: string, userA: string, userB: string) {
        // Find DM conversations where both users are members
        const userAConvs = await this.db
            .select({ conversationId: chatMembers.conversationId })
            .from(chatMembers)
            .where(
                and(
                    eq(chatMembers.tenantId, tenantId),
                    eq(chatMembers.userId, userA),
                    isNull(chatMembers.leftAt)
                )
            );

        if (!userAConvs.length) return null;

        const convIds = userAConvs.map((r) => r.conversationId);

        const dmConvs = await this.db
            .select()
            .from(chatConversations)
            .where(
                and(
                    inArray(chatConversations.id, convIds),
                    eq(chatConversations.tenantId, tenantId),
                    eq(chatConversations.type, 'direct')
                )
            );

        for (const conv of dmConvs) {
            const members = await this.db
                .select()
                .from(chatMembers)
                .where(
                    and(
                        eq(chatMembers.conversationId, conv.id),
                        isNull(chatMembers.leftAt)
                    )
                );
            const ids = members.map((m) => m.userId);
            if (ids.includes(userA) && ids.includes(userB) && ids.length === 2) {
                return this.getConversationById(tenantId, userA, conv.id);
            }
        }
        return null;
    }

    async assertMember(conversationId: string, userId: string, tenantId: string) {
        const member = await this.db
            .select()
            .from(chatMembers)
            .where(
                and(
                    eq(chatMembers.conversationId, conversationId),
                    eq(chatMembers.userId, userId),
                    eq(chatMembers.tenantId, tenantId),
                    isNull(chatMembers.leftAt)
                )
            )
            .limit(1);

        if (!member.length) throw new ForbiddenException('You are not a member of this conversation');
        return member[0];
    }

    private async assertAdmin(conversationId: string, userId: string, tenantId: string) {
        const member = await this.db
            .select()
            .from(chatMembers)
            .where(
                and(
                    eq(chatMembers.conversationId, conversationId),
                    eq(chatMembers.userId, userId),
                    eq(chatMembers.tenantId, tenantId),
                    eq(chatMembers.isAdmin, true),
                    isNull(chatMembers.leftAt)
                )
            )
            .limit(1);

        if (!member.length) throw new ForbiddenException('Only group admins can perform this action');
    }

    private async assertGroup(conversationId: string, tenantId: string) {
        const conv = await this.db
            .select()
            .from(chatConversations)
            .where(
                and(
                    eq(chatConversations.id, conversationId),
                    eq(chatConversations.tenantId, tenantId)
                )
            )
            .limit(1);

        if (!conv.length) throw new NotFoundException('Conversation not found');
        if (conv[0].type !== 'group') {
            throw new BadRequestException('This action is only allowed for group conversations');
        }
        return conv[0];
    }

    async deleteConversation(tenantId: string, userId: string, conversationId: string) {
        // 1. Fetch conversation
        const conv = await this.db
            .select()
            .from(chatConversations)
            .where(
                and(
                    eq(chatConversations.id, conversationId),
                    eq(chatConversations.tenantId, tenantId)
                )
            )
            .limit(1);

        if (!conv.length) throw new NotFoundException('Conversation not found');

        // 2. Validate Permissions
        // DMs: Any member can delete it.
        // Groups: Only admins can delete it.
        if (conv[0].type === 'group') {
            await this.assertAdmin(conversationId, userId, tenantId);
        } else {
            await this.assertMember(conversationId, userId, tenantId);
        }

        // 3. Delete sequentially to avoid orphaned data (transactions optional depending on Drizzle config, doing sequentially here)
        await this.db
            .delete(chatMessageReads)
            .where(eq(chatMessageReads.conversationId, conversationId));

        await this.db
            .delete(chatMessages)
            .where(eq(chatMessages.conversationId, conversationId));

        await this.db
            .delete(chatMembers)
            .where(eq(chatMembers.conversationId, conversationId));

        await this.db
            .delete(chatConversations)
            .where(
                and(
                    eq(chatConversations.id, conversationId),
                    eq(chatConversations.tenantId, tenantId)
                )
            );

        return { success: true, message: 'Conversation deleted successfully' };
    }

    private async getUnreadCounts(
        convIds: string[],
        userId: string,
        tenantId: string,
        readMap: Map<string, any>
    ): Promise<Map<string, number>> {
        const unreadMap = new Map<string, number>();

        for (const convId of convIds) {
            const readReceipt = readMap.get(convId);
            let count = 0;

            if (!readReceipt) {
                // Never read — count all messages not sent by me
                const result = await this.db
                    .select({ count: sql<number>`count(*)::int` })
                    .from(chatMessages)
                    .where(
                        and(
                            eq(chatMessages.conversationId, convId),
                            eq(chatMessages.tenantId, tenantId),
                            ne(chatMessages.senderUserId, userId),
                            isNull(chatMessages.deletedAt)
                        )
                    );
                count = result[0]?.count ?? 0;
            } else {
                // Count messages newer than lastReadMessageId not sent by me
                const lastRead = await this.db
                    .select({ createdAt: chatMessages.createdAt })
                    .from(chatMessages)
                    .where(eq(chatMessages.id, readReceipt.lastReadMessageId))
                    .limit(1);

                if (lastRead.length > 0) {
                    const result = await this.db
                        .select({ count: sql<number>`count(*)::int` })
                        .from(chatMessages)
                        .where(
                            and(
                                eq(chatMessages.conversationId, convId),
                                eq(chatMessages.tenantId, tenantId),
                                ne(chatMessages.senderUserId, userId),
                                isNull(chatMessages.deletedAt),
                                sql`${chatMessages.createdAt} > ${lastRead[0].createdAt}`
                            )
                        );
                    count = result[0]?.count ?? 0;
                }
            }

            unreadMap.set(convId, count);
        }

        return unreadMap;
    }

    // Utility for gateway — check if user is member of conversation
    async isMember(conversationId: string, userId: string, tenantId: string): Promise<boolean> {
        const member = await this.db
            .select({ id: chatMembers.id })
            .from(chatMembers)
            .where(
                and(
                    eq(chatMembers.conversationId, conversationId),
                    eq(chatMembers.userId, userId),
                    eq(chatMembers.tenantId, tenantId),
                    isNull(chatMembers.leftAt)
                )
            )
            .limit(1);

        return member.length > 0;
    }

    // Get member IDs of a conversation (for broadcasting)
    async getConversationMemberIds(conversationId: string): Promise<string[]> {
        const members = await this.db
            .select({ userId: chatMembers.userId })
            .from(chatMembers)
            .where(
                and(
                    eq(chatMembers.conversationId, conversationId),
                    isNull(chatMembers.leftAt)
                )
            );
        return members.map((m) => m.userId);
    }
}
