import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createConversationSchema } from '@/lib/validations';
import { protectedMiddleware } from '@/middleware/auth';
import { Conversation, User, Message } from '@/models';
import { connectDB } from '@/lib/db';

/**
 * Create new conversation endpoint
 * Security: Authentication, participant validation
 * Privacy: Only participants can access conversations
 * POST /api/chat/conversations
 */
export async function POST(request: NextRequest) {
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

    // Parse and validate request body
    const body = await request.json().catch(() => ({}));

    let validatedData: any;
    try {
      validatedData = createConversationSchema.parse(body);
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

    const { type, name, participantIds, baseLocation, isOfficial } = validatedData;
    const currentUserId = authRequest.user._id;

    // Add current user to participants
    const allParticipants = [currentUserId.toString(), ...participantIds];

    // For direct conversations, check if conversation already exists
    if (type === 'direct') {
      const existingConversation = await (Conversation as any).findDirectConversation(
        currentUserId,
        participantIds[0]
      );

      if (existingConversation) {
        return NextResponse.json(
          {
            success: true,
            message: 'Conversation already exists',
            data: {
              conversation: existingConversation,
            },
          },
          { status: 200 }
        );
      }
    }

    // Validate participants exist
    const participants = await User.find({
      _id: { $in: participantIds }
    }).select('_id username firstName lastName avatarUrl');

    if (participants.length !== participantIds.length) {
      return NextResponse.json(
        {
          success: false,
          error: 'One or more participants not found',
        },
        { status: 404 }
      );
    }

    // Create conversation
    const conversation = new Conversation({
      type,
      name: type === 'group' ? name : undefined,
      participants: allParticipants,
      adminId: type === 'group' ? currentUserId : undefined,
      metadata: {
        baseLocation,
        isOfficial: isOfficial || false,
      },
    });

    await conversation.save();

    // Populate participant information
    await conversation.populate('participants', 'username firstName lastName avatarUrl');
    if (conversation.adminId) {
      await conversation.populate('adminId', 'username firstName lastName avatarUrl');
    }

    const response = {
      success: true,
      message: 'Conversation created successfully',
      data: {
        conversation,
      },
    };

    return NextResponse.json(response, { status: 201 });

  } catch (error) {
    console.error('Create conversation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create conversation',
      },
      { status: 500 }
    );
  }
}

/**
 * Get user conversations endpoint
 * Security: Authentication, privacy controls
 * Privacy: Only user's conversations returned
 * GET /api/chat/conversations
 */
export async function GET(request: NextRequest) {
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

    const userId = authRequest.user._id;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // Find user's conversations
    const conversations = await Conversation.find({
      participants: userId,
      'archivedBy': { $ne: userId } // Exclude conversations archived by user
    })
      .populate('participants', 'username firstName lastName avatarUrl')
      .populate('adminId', 'username firstName lastName avatarUrl')
      .populate('lastMessage.senderId', 'username firstName lastName avatarUrl')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count
    const total = await Conversation.countDocuments({
      participants: userId,
      'archivedBy': { $ne: userId }
    });

    // Add unread message count for each conversation
    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conversation: any) => {
        try {
          const unreadCount = await Message.countDocuments({
            conversationId: conversation._id,
            senderId: { $ne: userId },
            'readBy.userId': { $ne: userId }
          });

          return {
            ...conversation,
            unreadCount,
          };
        } catch (error) {
          console.error('Error getting unread count:', error);
          return {
            ...conversation,
            unreadCount: 0,
          };
        }
      })
    );

    const response = {
      success: true,
      data: {
        conversations: conversationsWithUnread,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasMore: skip + conversations.length < total,
        },
      },
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Get conversations error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve conversations',
      },
      { status: 500 }
    );
  }
}