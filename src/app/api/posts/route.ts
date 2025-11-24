import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createPostSchema, postsQuerySchema, CreatePostInput } from '@/lib/validations';
import { protectedMiddleware } from '@/middleware/auth';
import { Post, User, Notification } from '@/models';
import { connectDB } from '@/lib/db';

/**
 * Create new post endpoint
 * Security: Authentication, content validation, rate limiting
 * Privacy: User-controlled visibility settings
 * POST /api/posts
 */
export async function POST(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Apply authentication and rate limiting middleware
    const { request: authRequest, response: authResponse } = await protectedMiddleware(request, 'post');
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

    let validatedData: CreatePostInput;
    try {
      validatedData = createPostSchema.parse(body);
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
    const userId = authRequest.user._id;

    // Create new post
    const post = new Post({
      content,
      authorId: userId,
      visibility: visibility || 'public',
      tags: tags || [],
      isEdited: false,
      reportedBy: [],
      isModerated: false,
    });

    await post.save();

    // Populate author information for response
    await post.populate('authorId', 'username firstName lastName avatarUrl baseLocation');

    const response = {
      success: true,
      message: 'Post created successfully',
      data: {
        post: {
          ...post.toJSON(),
          author: post.authorId,
        },
      },
    };

    return NextResponse.json(response, { status: 201 });

  } catch (error) {
    console.error('Create post error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create post',
      },
      { status: 500 }
    );
  }
}

/**
 * Get posts endpoint (feed)
 * Security: Privacy controls, visibility filtering
 * Privacy: Respect user privacy settings
 * GET /api/posts
 */
export async function GET(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryData: any = {};

    // Extract query parameters
    queryData.page = parseInt(searchParams.get('page') || '1');
    queryData.limit = parseInt(searchParams.get('limit') || '20');
    queryData.visibility = searchParams.get('visibility') || 'public';
    queryData.authorId = searchParams.get('authorId') || undefined;
    queryData.baseLocation = searchParams.get('baseLocation') || undefined;

    // Parse tags if provided
    const tagsParam = searchParams.get('tags');
    if (tagsParam) {
      queryData.tags = tagsParam.split(',').map(tag => tag.trim()).filter(Boolean);
    }

    // Validate query parameters
    let validatedQuery: any;
    try {
      validatedQuery = postsQuerySchema.parse(queryData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid query parameters',
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

    const { page, limit, visibility, authorId, tags, baseLocation } = validatedQuery;
    const skip = (page - 1) * limit;

    // Build query
    let query: any = {
      isModerated: false, // Exclude moderated posts
      reportedBy: { $size: 0 }, // Exclude posts with reports
    };

    // Apply visibility filter
    if (visibility !== 'all') {
      query.visibility = visibility;
    } else {
      // For 'all', include public and friends posts
      query.visibility = { $in: ['public', 'friends'] };
    }

    // Apply author filter
    if (authorId) {
      query.authorId = authorId;
    }

    // Apply tags filter
    if (tags && tags.length > 0) {
      query.tags = { $in: tags };
    }

    // Apply base location filter
    if (baseLocation) {
      // Find users from this base location
      const usersFromBase = await User.find({ baseLocation }).select('_id');
      const userIds = usersFromBase.map(user => user._id);

      if (userIds.length > 0) {
        query.$or = [
          { authorId: { $in: userIds } },
          { 'metadata.baseLocation': baseLocation }
        ];
      }
    }

    // Execute query with pagination
    const posts = await Post.find(query)
      .populate('authorId', 'username firstName lastName avatarUrl baseLocation')
      .populate('likes', 'username firstName lastName avatarUrl')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count for pagination
    const total = await Post.countDocuments(query);

    // Filter posts based on privacy settings
    const filteredPosts = await Promise.all(
      posts.map(async (post: any) => {
        // Check if post can be viewed by current user (if authenticated)
        const canView = await (Post as any).prototype.canBeViewedBy.call(
          { ...post, authorId: post.authorId._id },
          request.headers.get('authorization') ? 'authenticated_user' : null
        );

        return canView ? post : null;
      })
    );

    // Remove null posts (those that can't be viewed)
    const visiblePosts = filteredPosts.filter(post => post !== null);

    const response = {
      success: true,
      data: {
        posts: visiblePosts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasMore: skip + visiblePosts.length < total,
        },
      },
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Get posts error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve posts',
      },
      { status: 500 }
    );
  }
}