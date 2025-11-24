import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { registerSchema, RegisterInput } from '@/lib/validations';
import { authUtils, rateLimitUtils } from '@/lib/auth';
import { redisHelpers } from '@/lib/redis';
import { User } from '@/models';
import { connectDB } from '@/lib/db';

/**
 * User registration endpoint
 * Security: Input validation, rate limiting, password hashing
 * Privacy: Email verification, minimal data collection
 * POST /api/auth/register
 */
export async function POST(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Rate limiting: 3 attempts per 5 minutes per IP
    const rateLimitResponse = await rateLimitMiddleware(request, 'register');
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Parse and validate request body
    const body = await request.json().catch(() => ({}));

    let validatedData: RegisterInput;
    try {
      validatedData = registerSchema.parse(body);
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

    const { email, password, username, firstName, lastName, baseLocation, serviceBranch, parentRank } = validatedData;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      const field = existingUser.email === email ? 'email' : 'username';
      return NextResponse.json(
        {
          success: false,
          error: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`,
        },
        { status: 409 }
      );
    }

    // Create new user (password will be hashed by User model middleware)
    const user = new User({
      email,
      password, // Will be hashed by pre-save middleware
      username,
      firstName,
      lastName,
      baseLocation,
      serviceBranch,
      parentRank,
      isPrivate: false, // Default to public profile
      role: 'user',
      emailVerified: false, // Require email verification
    });

    await user.save();

    // Generate email verification token
    const emailVerificationToken = authUtils.generateEmailVerificationToken(
      user._id.toString(),
      user.email
    );

    // Store email verification token in Redis for quick lookup
    await redisHelpers.setWithExpiry(
      `email_verification:${user.email}`,
      emailVerificationToken,
      24 * 60 * 60 // 24 hours
    );

    // Generate tokens for automatic login
    const accessToken = authUtils.generateAccessToken(user);
    const { token: refreshToken, tokenId } = authUtils.generateRefreshToken(user._id.toString());

    // Store refresh token in user document
    await user.addRefreshToken(refreshToken);

    // Create welcome notification
    await createWelcomeNotification(user._id.toString());

    // TODO: Send verification email
    // For now, return token in development environment
    const isDevelopment = process.env.NODE_ENV === 'development';

    // Security: Don't return sensitive data
    const response = {
      success: true,
      message: 'Registration successful. Please check your email for verification.',
      data: {
        user: user.getPublicProfile(),
        accessToken,
        refreshToken,
        emailVerificationToken: isDevelopment ? emailVerificationToken : undefined,
      },
    };

    return NextResponse.json(response, { status: 201 });

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Registration failed. Please try again.',
      },
      { status: 500 }
    );
  }
}

/**
 * Helper function to create welcome notification
 */
async function createWelcomeNotification(userId: string) {
  try {
    const { Notification } = await import('@/models');

    await Notification.createNotification(
      userId,
      'system',
      'Welcome to Defence Brats!',
      'Your account has been created successfully. Complete your profile to connect with other defence community members.',
      {
        category: 'welcome',
        source: 'system'
      }
    );
  } catch (error) {
    console.error('Failed to create welcome notification:', error);
    // Don't fail registration if notification creation fails
  }
}

/**
 * Rate limiting helper function
 */
async function rateLimitMiddleware(request: NextRequest, action: string): Promise<NextResponse | null> {
  const window = rateLimitUtils.windows[action as keyof typeof rateLimitUtils.windows] || 300;
  const limit = rateLimitUtils.limits[action as keyof typeof rateLimitUtils.limits] || 3;

  const identifier = request.ip || 'unknown';
  const key = rateLimitUtils.getRateLimitKey(identifier, action, window);

  const current = await redisHelpers.increment(key, window);

  if (current > limit) {
    return NextResponse.json(
      {
        success: false,
        error: `Too many registration attempts. Please try again later.`,
        retryAfter: window,
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(Date.now() + window * 1000).toISOString(),
        },
      }
    );
  }

  return null;
}