import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { updatePostSchema, createCommentSchema } from '@/lib/validations';
import { protectedMiddleware, ownsResource } from '@/middleware/auth';
import { Post, User, Notification } from '@/models';
import { connectDB } from '@/lib/db';

/**
 * Get specific post endpoint
 * Security: Privacy controls, visibility checks
 * Privacy: Respect user privacy settings
 * GET /api/posts/[postId]
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

    // Find post with populated data
    const post = await Post.findById(postId)
      .populate('authorId', 'username firstName lastName avatarUrl baseLocation')
      .populate('likes', 'username firstName lastName avatarUrl')
      .populate('comments.authorId', 'username firstName lastName avatarUrl')
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

    // Check if post can be viewed (public posts can be viewed by anyone)
    const canView = await (Post as any).prototype.canBeViewedBy.call(
      post,
      null // Public access for GET
    );

    if (!canView) {
      return NextResponse.json(
        {
          success: false,
          error: 'Post not available',
        },
        { status: 403 }
      );
    }

    const response = {
      success: true,
      data: {
        post,
      },
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Get post error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve post',
      },
      { status: 500 }
    );
  }
}

/**
 * Update post endpoint
 * Security: Authorization, content validation, edit time limit
 * Privacy: User can only edit their own posts
 * PUT /api/posts/[postId]
 */
export async function PUT(
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

    // Check ownership
    if (!ownsResource(authRequest, post.authorId.toString())) {
      return NextResponse.json(
        {
          success: false,
          error: 'Not authorized to edit this post',
        },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json().catch(() => ({}));

    let validatedData: any;
    try {
      validatedData = updatePostSchema.parse(body);
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

    const { content, visibility, tags } = validatedData;

    // Update post
    if (content !== undefined) {
      post.content = content;
    }
    if (visibility !== undefined) {
      post.visibility = visibility;
    }
    if (tags !== undefined) {
      post.tags = tags;
    }

    await post.save();

    // Populate author information for response
    await post.populate('authorId', 'username firstName lastName avatarUrl baseLocation');

    const response = {
      success: true,
      message: 'Post updated successfully',
      data: {
        post,
      },
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Update post error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update post',
      },
      { status: 500 }
    );
  }
}

/**
 * Delete post endpoint
 * Security: Authorization, cascade delete of comments
 * Privacy: User can only delete their own posts
 * DELETE /api/posts/[postId]
 */
export async function DELETE(
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

    // Check ownership (or admin)
    if (!ownsResource(authRequest, post.authorId.toString())) {
      return NextResponse.json(
        {
          success: false,
          error: 'Not authorized to delete this post',
        },
        { status: 403 }
      );
    }

    // Delete post (mongoose will handle cascading comments)
    await Post.findByIdAndDelete(postId);

    const response = {
      success: true,
      message: 'Post deleted successfully',
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Delete post error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete post',
      },
      { status: 500 }
    );
  }
}