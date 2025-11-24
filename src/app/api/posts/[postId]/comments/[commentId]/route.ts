import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createCommentSchema } from '@/lib/validations';
import { protectedMiddleware, ownsResource } from '@/middleware/auth';
import { Post, User } from '@/models';
import { connectDB } from '@/lib/db';

/**
 * Update comment endpoint
 * Security: Authentication, authorization, content validation, edit time limit
 * Privacy: User can only edit their own comments
 * PUT /api/posts/[postId]/comments/[commentId]
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { postId: string; commentId: string } }
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

    const { postId, commentId } = params;
    const userId = authRequest.user._id;

    // Validate IDs
    if (!postId || !commentId || typeof postId !== 'string' || typeof commentId !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid post or comment ID',
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

    // Find comment
    const comment = post.comments.id(commentId);
    if (!comment) {
      return NextResponse.json(
        {
          success: false,
          error: 'Comment not found',
        },
        { status: 404 }
      );
    }

    // Check ownership
    if (!ownsResource(authRequest, comment.authorId.toString())) {
      return NextResponse.json(
        {
          success: false,
          error: 'Not authorized to edit this comment',
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

    // Check if comment is too old to edit (15 minutes)
    const editTimeLimit = 15 * 60 * 1000; // 15 minutes in milliseconds
    if (Date.now() - comment.createdAt.getTime() > editTimeLimit) {
      return NextResponse.json(
        {
          success: false,
          error: 'Comments can only be edited within 15 minutes of posting',
        },
        { status: 400 }
      );
    }

    // Update comment
    comment.content = content;
    comment.updatedAt = new Date();
    await post.save();

    // Get updated comment with populated author
    const updatedPost = await Post.findById(postId)
      .populate('comments.authorId', 'username firstName lastName avatarUrl')
      .lean();

    if (!updatedPost) {
      throw new Error('Failed to retrieve updated post');
    }

    const updatedComment = updatedPost.comments.find((c: any) => c._id.toString() === commentId);

    const response = {
      success: true,
      message: 'Comment updated successfully',
      data: {
        comment: updatedComment,
      },
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Update comment error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update comment',
      },
      { status: 500 }
    );
  }
}

/**
 * Delete comment endpoint
 * Security: Authentication, authorization
 * Privacy: User can delete their own comments, post author can delete any comment
 * DELETE /api/posts/[postId]/comments/[commentId]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { postId: string; commentId: string } }
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

    const { postId, commentId } = params;
    const userId = authRequest.user._id;

    // Validate IDs
    if (!postId || !commentId || typeof postId !== 'string' || typeof commentId !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid post or comment ID',
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

    // Find comment
    const comment = post.comments.id(commentId);
    if (!comment) {
      return NextResponse.json(
        {
          success: false,
          error: 'Comment not found',
        },
        { status: 404 }
      );
    }

    // Check if user can delete comment (comment author or post author)
    const canDelete = ownsResource(authRequest, comment.authorId.toString()) ||
                     ownsResource(authRequest, post.authorId.toString());

    if (!canDelete) {
      return NextResponse.json(
        {
          success: false,
          error: 'Not authorized to delete this comment',
        },
        { status: 403 }
      );
    }

    // Get comment count before deletion
    const commentCountBefore = post.comments.length;

    // Remove comment
    post.comments.pull(commentId);
    await post.save();

    const response = {
      success: true,
      message: 'Comment deleted successfully',
      data: {
        commentCount: post.comments.length,
        deletedCommentId: commentId,
      },
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Delete comment error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete comment',
      },
      { status: 500 }
    );
  }
}