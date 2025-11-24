import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createMessageSchema } from '@/lib/validations';
import { protectedMiddleware } from '@/middleware/auth';
import { Message, Conversation, User, Notification } from '@/models';
import { connectDB } from '@/lib/db';

/**
 * Send message endpoint
 * Security: Authentication, participant verification, content validation
 * Privacy: Only participants can send messages
 * POST /api/chat/conversations/[conversationId]/messages
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  try {
    // Connect to database
    await connectDB();

    // Apply authentication middleware
    const { request: authRequest, response: authResponse } = await protectedMiddleware(request, 'message');
    if (authResponse) {
      return authResponse;
    }

    if (!authRequest.isAuthenticated || !authRequest.user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required',
        },
        { status: 401 }
      );
    }

    const { conversationId } = params;
    const userId = authRequest.user._id;

    // Validate conversationId
    if (!conversationId || typeof conversationId !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid conversation ID',
        },
        { status: 400 }
      );
    }

    // Find conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return NextResponse.json(
        {
          success: false,
          error: 'Conversation not found',
        },
        { status: 404 }
      );
    }

    // Check if user is participant
    if (!conversation.isParticipant(userId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Not authorized to send messages to this conversation',
        },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json().catch(() => ({}));

    let validatedData: any;
    try {
      validatedData = createMessageSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: 'Validation failed',
            details: error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message,
            })),
          },
          { status: 400 }
        );
      }
      throw error;
    }

    const { content, messageType = 'text', imageUrl, replyTo } = validatedData;

    // Create message
    const message = new Message({
      conversationId,
      senderId: userId,
      content: messageType === 'text' ? content : undefined,
      imageUrl: messageType === 'image' ? imageUrl : undefined,
      messageType,
      replyTo,
      readBy: [{ userId, readAt: new Date() }],
    });

    await message.save();

    // Populate sender information
    await message.populate('senderId', 'username firstName lastName avatarUrl');
    if (replyTo) {
      await message.populate('replyTo.senderId', 'username firstName lastName avatarUrl');
    }

    // Update conversation's last message
    await conversation.updateLastMessage(
      messageType === 'text' ? content : '[Image]',
      userId,
      messageType
    );

    // Create notifications for offline users
    await createMessageNotifications(conversation, message, userId);

    const response = {
      success: true,
      message: 'Message sent successfully',
      data: {
        message,
      },
    };

    return NextResponse.json(response, { status: 201 });

  } catch (error) {
    console.error('Send message error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send message',
      },
      { status: 500 }
    );
  }
}

/**
 * Get messages endpoint
 * Security: Authentication, participant verification
 * Privacy: Only participants can read messages
 * GET /api/chat/conversations/[conversationId]/messages
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  try {
    // Connect to database
    await connectDB();

    // Apply authentication middleware
    const { request: authRequest, response: authResponse } = await protectedMiddleware(request);
    if (authResponse) {
      return authResponse;
    }

    if (!authRequest.isAuthenticated || !authRequest.user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required',
        },
        { status: 401 }
      );
    }

    const { conversationId } = params;
    const userId = authRequest.user._id;

    // Validate conversationId
    if (!conversationId || typeof conversationId !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid conversation ID',
        },
        { status: 400 }
      );
    }

    // Find conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return NextResponse.json(
        {
          success: false,
          error: 'Conversation not found',
        },
        { status: 404 }
      );
    }

    // Check if user is participant
    if (!conversation.isParticipant(userId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Not authorized to access this conversation',
        },
        { status: 403 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100); // Max 100 messages
    const skip = (page - 1) * limit;
    const before = searchParams.get('before'); // Get messages before this timestamp

    // Build query
    const query: any = {
      conversationId,
      isDeleted: false,
    };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    // Get messages
    const messages = await Message.find(query)
      .populate('senderId', 'username firstName lastName avatarUrl')
      .populate('replyTo.senderId', 'username firstName lastName avatarUrl')
      .populate('readBy.userId', 'username firstName lastName avatarUrl')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total message count
    const totalMessages = await Message.countDocuments({
      conversationId,
      isDeleted: false,
    });

    // Mark messages as read by this user
    const unreadMessages = messages.filter((msg: any) =>
      !msg.readBy.some((read: any) => read.userId.toString() === userId.toString()) &&
      msg.senderId._id.toString() !== userId.toString()
    );

    if (unreadMessages.length > 0) {
      await Message.updateMany(
        {
          _id: { $in: unreadMessages.map((msg: any) => msg._id) },
          'readBy.userId': { $ne: userId }
        },
        {
          $push: { readBy: { userId, readAt: new Date() } }
        }
      );
    }

    const response = {
      success: true,
      data: {
        messages: messages.reverse(), // Return in chronological order
        pagination: {
          page,
          limit,
          total: totalMessages,
          pages: Math.ceil(totalMessages / limit),
          hasMore: skip + messages.length < totalMessages,
        },
      },
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Get messages error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve messages',
      },
      { status: 500 }
    );
  }
}

/**
 * Helper function to create message notifications for offline users
 */
async function createMessageNotifications(
  conversation: any,
  message: any,
  senderId: string
): Promise<void> {
  try {
    const recipients = conversation.participants.filter(
      (participantId: any) => !participantId.equals(senderId)
    );

    for (const recipientId of recipients) {
      // Get recipient user to check notification preferences
      const recipient = await User.findById(recipientId);
      if (!recipient || recipient.emailVerified === false) {
        continue; // Skip unverified users
      }

      // Check if user wants message notifications
      // This would typically be stored in user preferences
      const wantsNotifications = true; // Default for now

      if (wantsNotifications) {
        let notificationTitle = 'New Message';
        let notificationContent = '';

        if (conversation.type === 'direct') {
          // For direct messages, use sender's name
          notificationTitle = `New message from ${message.senderId.firstName}`;
          notificationContent = message.content?.substring(0, 100) || '[Image]';
        } else if (conversation.type === 'group') {
          // For group messages, include group name
          notificationTitle = `New message in ${conversation.name}`;
          notificationContent = `${message.senderId.firstName}: ${message.content?.substring(0, 80) || '[Image]'}`;
        }

        await Notification.createNotification(
          recipientId.toString(),
          'message',
          notificationTitle,
          notificationContent,
          {
            conversationId: conversation._id,
            messageId: message._id,
            userId: senderId,
            category: 'messaging'
          }
        );
      }
    }
  } catch (error) {
    console.error('Error creating message notifications:', error);
    // Don't fail message sending if notification creation fails
  }
}