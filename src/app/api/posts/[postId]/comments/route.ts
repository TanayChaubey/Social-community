import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createCommentSchema } from '@/lib/validations';
import { protectedMiddleware } from '@/middleware/auth';
import { Post, User, Notification } from '@/models';
import { connectDB } from '@/lib/db';

/**
 * Add comment to post endpoint
 * Security: Authentication, content validation, rate limiting
 * Privacy: User can only comment on visible posts
 * POST /api/posts/[postId]/comments
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { postId: string } }
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

    const { postId } = params;
    const userId = authRequest.user._id;

    // Validate postId
    if (!postId || typeof postId !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid post ID',
        },
        { status: 400 }
      );
    }

    // Find post
    const post = await Post.findById(postId);
    if (!post) {
      return NextResponse.json(
        {
          success: false,
          error: 'Post not found',
        },
        { status: 404 }
      );
    }

    // Check if post can be viewed/commented
    const canView = await post.canBeViewedBy(userId);
    if (!canView) {
      return NextResponse.json(
        {
          success: false,
          error: 'Post not available',
        },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json().catch(() => ({}));

    let validatedData: { content: string };
    try {
      validatedData = createCommentSchema.parse(body);
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

    const { content } = validatedData;

    // Add comment to post
    await post.addComment(userId, content);

    // Get updated post with populated comments
    const updatedPost = await Post.findById(postId)
      .populate('comments.authorId', 'username firstName lastName avatarUrl')
      .populate('comments.authorId', 'username firstName lastName avatarUrl')
      .lean();

    if (!updatedPost) {
      throw new Error('Failed to retrieve updated post');
    }

    // Get the newly added comment (last one)
    const newComment = updatedPost.comments[updatedPost.comments.length - 1];

    // Create notification for post author (if not commenting on own post)
    if (!post.authorId.equals(userId)) {
      await createCommentNotification(
        post.authorId.toString(),
        userId.toString(),
        postId,
        authRequest.user.username,
        content
      );
    }

    const response = {
      success: true,
      message: 'Comment added successfully',
      data: {
        comment: newComment,
        commentCount: updatedPost.comments.length,
      },
    };

    return NextResponse.json(response, { status: 201 });

  } catch (error) {
    console.error('Add comment error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to add comment',
      },
      { status: 500 }
    );
  }
}

/**
 * Get post comments endpoint
 * Security: Public information (with pagination)
 * GET /api/posts/[postId]/comments
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    // Connect to database
    await connectDB();

    const { postId } = params;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // Validate postId
    if (!postId || typeof postId !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid post ID',
        },
        { status: 400 }
      );
    }

    // Find post to verify it exists
    const post = await Post.findById(postId).select('comments').lean();
    if (!post) {
      return NextResponse.json(
        {
          success: false,
          error: 'Post not found',
        },
        { status: 404 }
      );
    }

    // Get total comment count
    const totalComments = post.comments.length;

    // Get paginated comments with populated author data
    const postWithComments = await Post.findById(postId)
      .populate({
        path: 'comments',
        options: {
          sort: { createdAt: -1 },
          skip,
          limit,
        },
        populate: {
          path: 'authorId',
          select: 'username firstName lastName avatarUrl',
        },
      })
      .select('comments')
      .lean();

    if (!postWithComments) {
      throw new Error('Failed to retrieve comments');
    }

    const response = {
      success: true,
      data: {
        comments: postWithComments.comments,
        pagination: {
          page,
          limit,
          total: totalComments,
          pages: Math.ceil(totalComments / limit),
          hasMore: skip + postWithComments.comments.length < totalComments,
        },
      },
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Get comments error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve comments',
      },
      { status: 500 }
    );
  }
}

/**
 * Helper function to create comment notification
 */
async function createCommentNotification(
  authorId: string,
  commenterId: string,
  postId: string,
  commenterUsername: string,
  commentContent: string
): Promise<void> {
  try {
    // Truncate comment content for notification
    const truncatedContent = commentContent.length > 100
      ? commentContent.substring(0, 100) + '...'
      : commentContent;

    await Notification.createNotification(
      authorId,
      'comment',
      'New Comment on Your Post',
      `${commenterUsername} commented: "${truncatedContent}"`,
      {
        postId,
        userId: commenterId,
        category: 'engagement',
        source: 'system'
      }
    );
  } catch (error) {
    console.error('Failed to create comment notification:', error);
    // Don't fail comment action if notification creation fails
  }
}