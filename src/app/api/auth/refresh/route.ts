import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authUtils } from '@/lib/auth';
import { User } from '@/models';
import { connectDB } from '@/lib/db';

/**
 * Refresh token endpoint
 * Security: Token rotation, validation, and blacklisting
 * Privacy: Secure token management
 * POST /api/auth/refresh
 */

// Validation schema for refresh token request
const refreshSchema = z.object({
  refreshToken: z
    .string()
    .min(1, 'Refresh token is required'),
});

export async function POST(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Parse and validate request body
    const body = await request.json().catch(() => ({}));

    let validatedData: { refreshToken: string };
    try {
      validatedData = refreshSchema.parse(body);
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

    const { refreshToken } = validatedData;

    // Verify refresh token
    const payload = authUtils.verifyRefreshToken(refreshToken);
    if (!payload) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid or expired refresh token',
        },
        { status: 401 }
      );
    }

    // Find user
    const user = await User.findById(payload.userId).select('+refreshTokens');
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'User not found',
        },
        { status: 401 }
      );
    }

    // Check if refresh token is still valid (not revoked)
    const isTokenValid = user.refreshTokens.includes(refreshToken);
    if (!isTokenValid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Refresh token has been revoked',
        },
        { status: 401 }
      );
    }

    // Check if user account is locked
    if (user.isLocked()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Account is temporarily locked',
        },
        { status: 423 }
      );
    }

    // Generate new tokens (token rotation)
    const newAccessToken = authUtils.generateAccessToken(user);
    const { token: newRefreshToken, tokenId: newTokenId } = authUtils.generateRefreshToken(user._id.toString());

    // Remove old refresh token and add new one
    await user.removeRefreshToken(refreshToken);
    await user.addRefreshToken(newRefreshToken);

    // Update last activity
    user.lastLogin = new Date();
    await user.save();

    const response = {
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Token refresh failed',
      },
      { status: 500 }
    );
  }
}

/**
 * Logout endpoint - invalidate refresh token
 * Security: Token blacklisting and session cleanup
 * POST /api/auth/refresh/logout
 */
export async function DELETE(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Parse and validate request body
    const body = await request.json().catch(() => ({}));

    let validatedData: { refreshToken: string };
    try {
      validatedData = refreshSchema.parse(body);
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

    const { refreshToken } = validatedData;

    // Try to find user by verifying the token first
    const payload = authUtils.verifyRefreshToken(refreshToken);
    if (payload) {
      // Find user and remove the refresh token
      const user = await User.findById(payload.userId).select('+refreshTokens');
      if (user) {
        await user.removeRefreshToken(refreshToken);
      }
    }

    // Always return success to prevent token enumeration attacks
    const response = {
      success: true,
      message: 'Logout successful',
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Logout error:', error);
    // Always return success to prevent token enumeration attacks
    const response = {
      success: true,
      message: 'Logout successful',
    };

    return NextResponse.json(response, { status: 200 });
  }
}