import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authUtils } from '@/lib/auth';
import { redisHelpers } from '@/lib/redis';
import { User } from '@/models';
import { connectDB } from '@/lib/db';

/**
 * Email verification endpoint
 * Security: Token validation, email verification
 * Privacy: Secure email confirmation process
 * POST /api/auth/verify-email
 */

// Validation schema for email verification
const verifyEmailSchema = z.object({
  token: z
    .string()
    .min(1, 'Verification token is required'),
});

// Validation schema for resending verification email
const resendVerificationSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address')
    .toLowerCase(),
});

/**
 * Verify email with token
 * POST /api/auth/verify-email
 */
export async function POST(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Parse and validate request body
    const body = await request.json().catch(() => ({}));

    let validatedData: { token: string };
    try {
      validatedData = verifyEmailSchema.parse(body);
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

    const { token } = validatedData;

    // Verify email verification token
    const tokenData = authUtils.verifyEmailVerificationToken(token);
    if (!tokenData) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid or expired verification token',
        },
        { status: 400 }
      );
    }

    const { userId, email } = tokenData;

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'User not found',
        },
        { status: 404 }
      );
    }

    // Verify email matches current user email
    if (user.email !== email) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email does not match user account',
        },
        { status: 400 }
      );
    }

    // Check if already verified
    if (user.emailVerified) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email is already verified',
        },
        { status: 400 }
      );
    }

    // Mark email as verified
    user.emailVerified = true;
    user.emailVerificationToken = undefined; // Clear token
    await user.save();

    // Clean up Redis verification token
    await redisHelpers.del(`email_verification:${email}`);

    // Create verification success notification
    await createVerificationNotification(user._id.toString());

    const response = {
      success: true,
      message: 'Email verified successfully',
      data: {
        user: user.getPublicProfile(),
      },
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Email verification failed',
      },
      { status: 500 }
    );
  }
}

/**
 * Resend verification email
 * POST /api/auth/verify-email/resend
 */
export async function PATCH(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Parse and validate request body
    const body = await request.json().catch(() => ({}));

    let validatedData: { email: string };
    try {
      validatedData = resendVerificationSchema.parse(body);
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

    const { email } = validatedData;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      // Return success to prevent email enumeration attacks
      return NextResponse.json(
        {
          success: true,
          message: 'If an account with this email exists, a verification email has been sent.',
        },
        { status: 200 }
      );
    }

    // Check if already verified
    if (user.emailVerified) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email is already verified',
        },
        { status: 400 }
      );
    }

    // Generate new verification token
    const verificationToken = authUtils.generateEmailVerificationToken(
      user._id.toString(),
      user.email
    );

    // Store new token in Redis
    await redisHelpers.setWithExpiry(
      `email_verification:${user.email}`,
      verificationToken,
      24 * 60 * 60 // 24 hours
    );

    // Update user with new token (optional backup)
    user.emailVerificationToken = verificationToken;
    await user.save();

    // TODO: Send verification email
    // For development, return token
    const isDevelopment = process.env.NODE_ENV === 'development';

    const response = {
      success: true,
      message: 'Verification email sent',
      data: {
        verificationToken: isDevelopment ? verificationToken : undefined,
      },
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to resend verification email',
      },
      { status: 500 }
    );
  }
}

/**
 * Check email verification status
 * GET /api/auth/verify-email
 */
export async function GET(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Get email from query parameter
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email parameter is required',
        },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      // Return success to prevent email enumeration attacks
      return NextResponse.json(
        {
          success: true,
          data: {
            emailVerified: false,
            message: 'Email verification status could not be determined',
          },
        },
        { status: 200 }
      );
    }

    const response = {
      success: true,
      data: {
        emailVerified: user.emailVerified,
        email: user.email, // Return email for confirmation
      },
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Check verification status error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check verification status',
      },
      { status: 500 }
    );
  }
}

/**
 * Helper function to create verification success notification
 */
async function createVerificationNotification(userId: string): Promise<void> {
  try {
    const { Notification } = await import('@/models');

    await Notification.createNotification(
      userId,
      'system',
      'Email Verified!',
      'Your email has been successfully verified. You now have full access to all platform features.',
      {
        category: 'verification',
        source: 'system',
        type: 'email_verified'
      }
    );
  } catch (error) {
    console.error('Failed to create verification notification:', error);
    // Don't fail verification if notification creation fails
  }
}