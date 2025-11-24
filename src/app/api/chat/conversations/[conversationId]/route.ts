import { NextRequest, NextResponse } from 'next/server';
import { protectedMiddleware, ownsResource } from '@/middleware/auth';
import { Conversation, Message, User, Notification } from '@/models';
import { connectDB } from '@/lib/db';

/**
 * Get specific conversation endpoint
 * Security: Authentication, participant verification
 * Privacy: Only participants can access conversation
 * GET /api/chat/conversations/[conversationId]
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
    const conversation = await Conversation.findById(conversationId)
      .populate('participants', 'username firstName lastName avatarUrl')
      .populate('adminId', 'username firstName lastName avatarUrl')
      .populate('lastMessage.senderId', 'username firstName lastName avatarUrl')
      .lean();

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
    if (!conversation.participants.some((p: any) => p._id.toString() === userId.toString())) {
      return NextResponse.json(
        {
          success: false,
          error: 'Not authorized to access this conversation',
        },
        { status: 403 }
      );
    }

    // Get messages for conversation (paginated)
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

    const messages = await Message.find({
      conversationId,
      isDeleted: false,
    })
      .populate('senderId', 'username firstName lastName avatarUrl')
      .populate('readBy.userId', 'username firstName lastName avatarUrl')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get message count
    const totalMessages = await Message.countDocuments({
      conversationId,
      isDeleted: false,
    });

    // Mark conversation as read by user
    await conversation.markAsRead(userId);

    const response = {
      success: true,
      data: {
        conversation,
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
    console.error('Get conversation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve conversation',
      },
      { status: 500 }
    );
  }
}

/**
 * Update conversation endpoint (admin actions)
 * Security: Authentication, admin role verification
 * PUT /api/chat/conversations/[conversationId]
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  try {
    // Connect to database
    await connectDB();

    // Apply authentication middleware with admin check
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

    // Check if user is admin or moderator
    if (!['admin', 'moderator'].includes(authRequest.user.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Insufficient permissions',
        },
        { status: 403 }
      );
    }

    const { conversationId } = params;

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

    // Parse request body
    const body = await request.json().catch(() => ({}));

    // Update allowed fields
    if (body.name !== undefined && conversation.type === 'group') {
      conversation.name = body.name;
    }

    if (body.baseLocation !== undefined) {
      conversation.metadata = conversation.metadata || {};
      conversation.metadata.baseLocation = body.baseLocation;
    }

    if (body.isOfficial !== undefined) {
      conversation.metadata = conversation.metadata || {};
      conversation.metadata.isOfficial = body.isOfficial;
    }

    if (body.adminId !== undefined && conversation.type === 'group') {
      // Only current admin can transfer admin rights
      if (conversation.adminId && conversation.adminId.toString() === authRequest.user._id.toString()) {
        // Validate new admin is a participant
        if (conversation.participants.includes(body.adminId)) {
          conversation.adminId = body.adminId;
        }
      }
    }

    await conversation.save();

    // Populate for response
    await conversation.populate('participants', 'username firstName lastName avatarUrl');
    await conversation.populate('adminId', 'username firstName lastName avatarUrl');

    const response = {
      success: true,
      message: 'Conversation updated successfully',
      data: {
        conversation,
      },
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Update conversation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update conversation',
      },
      { status: 500 }
    );
  }
}

/**
 * Delete conversation endpoint
 * Security: Authentication, participant verification
 * Privacy: Only participants can delete conversations
 * DELETE /api/chat/conversations/[conversationId]
 */
export async function DELETE(
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

    // Check if user can delete (participant or admin)
    const canDelete = conversation.participants.some((p: any) => p.toString() === userId.toString()) ||
                     authRequest.user.role === 'admin';

    if (!canDelete) {
      return NextResponse.json(
        {
          success: false,
          error: 'Not authorized to delete this conversation',
        },
        { status: 403 }
      );
    }

    // Delete all messages in conversation first
    await Message.deleteMany({ conversationId });

    // Delete conversation
    await Conversation.findByIdAndDelete(conversationId);

    // Notify participants about deletion
    const otherParticipants = conversation.participants.filter((p: any) => p.toString() !== userId.toString());

    for (const participantId of otherParticipants) {
      await Notification.createNotification(
        participantId.toString(),
        'system',
        'Conversation Deleted',
        `A conversation you were in has been deleted`,
        {
          conversationId,
          type: 'conversation_deleted'
        }
      );
    }

    const response = {
      success: true,
      message: 'Conversation deleted successfully',
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Delete conversation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete conversation',
      },
      { status: 500 }
    );
  }
}

/**
 * Archive conversation endpoint
 * Security: Authentication, participant verification
 * PATCH /api/chat/conversations/[conversationId]
 */
export async function PATCH(
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
    if (!conversation.participants.some((p: any) => p.toString() === userId.toString())) {
      return NextResponse.json(
        {
          success: false,
          error: 'Not authorized to modify this conversation',
        },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { archive } = body;

    if (archive === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'Archive action is required',
        },
        { status: 400 }
      );
    }

    if (archive) {
      await conversation.archive(userId);
    } else {
      await conversation.unarchive(userId);
    }

    const response = {
      success: true,
      message: archive ? 'Conversation archived' : 'Conversation unarchived',
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Archive conversation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to archive conversation',
      },
      { status: 500 }
    );
  }
}