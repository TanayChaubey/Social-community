import { NextRequest, NextResponse } from 'next/server';
import { protectedMiddleware } from '@/middleware/auth';
import { Post, User, Notification } from '@/models';
import { connectDB } from '@/lib/db';

/**
 * Like/unlike post endpoint
 * Security: Authentication, authorization
 * Privacy: User can only like visible posts
 * POST /api/posts/[postId]/like
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

    // Check if post can be viewed/liked
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

    // Check if already liked
    const isLiked = post.isLikedBy(userId);
    let message: string;
    let action: string;

    if (isLiked) {
      // Unlike the post
      await post.removeLike(userId);
      message = 'Post unliked successfully';
      action = 'unliked';
    } else {
      // Like the post
      await post.addLike(userId);
      message = 'Post liked successfully';
      action = 'liked';

      // Create notification for post author (if not liking own post)
      if (!post.authorId.equals(userId)) {
        await createLikeNotification(
          post.authorId.toString(),
          userId.toString(),
          postId,
          authRequest.user.username
        );
      }
    }

    // Get updated like count
    const updatedPost = await Post.findById(postId).select('likes');

    const response = {
      success: true,
      message,
      data: {
        action,
        likeCount: updatedPost?.likes.length || 0,
        isLiked: action === 'liked',
      },
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Like post error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process like action',
      },
      { status: 500 }
    );
  }
}

/**
 * Get post likes endpoint
 * Security: Public information
 * GET /api/posts/[postId]/like
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    // Connect to database
    await connectDB();

    const { postId } = params;

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

    // Find post with populated likes
    const post = await Post.findById(postId)
      .populate('likes', 'username firstName lastName avatarUrl')
      .select('likes')
      .lean();

    if (!post) {
      return NextResponse.json(
        {
          success: false,
          error: 'Post not found',
        },
        { status: 404 }
      );
    }

    const response = {
      success: true,
      data: {
        likes: post.likes,
        likeCount: post.likes.length,
      },
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Get likes error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve likes',
      },
      { status: 500 }
    );
  }
}

/**
 * Helper function to create like notification
 */
async function createLikeNotification(
  authorId: string,
  likerId: string,
  postId: string,
  likerUsername: string
): Promise<void> {
  try {
    // Don't create notification if user has notifications disabled
    const author = await User.findById(authorId);
    if (!author) return;

    await Notification.createNotification(
      authorId,
      'like',
      'New Like on Your Post',
      `${likerUsername} liked your post`,
      {
        postId,
        userId: likerId,
        category: 'engagement',
        source: 'system'
      }
    );
  } catch (error) {
    console.error('Failed to create like notification:', error);
    // Don't fail like action if notification creation fails
  }
}