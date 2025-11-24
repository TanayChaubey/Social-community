import { NextRequest, NextResponse } from 'next/server';
import { authUtils, rateLimitUtils } from '@/lib/auth';
import { redisHelpers } from '@/lib/redis';
import { User, IUser } from '@/models';

/**
 * Authentication middleware for API routes
 * Security: JWT validation, rate limiting, and user context injection
 * Privacy: Minimal logging, no sensitive data in logs
 */

export interface AuthenticatedRequest extends NextRequest {
  user?: IUser;
  userId?: string;
  isAuthenticated: boolean;
}

/**
 * Main authentication middleware
 * Validates JWT tokens and injects user context
 */
export async function authMiddleware(request: NextRequest): Promise<AuthenticatedRequest & { response?: NextResponse }> {
  const authHeader = request.headers.get('authorization');
  const token = authUtils.extractTokenFromHeader(authHeader);

  // If no token, return unauthenticated request
  if (!token) {
    return {
      ...request,
      isAuthenticated: false,
    };
  }

  try {
    // Verify JWT token
    const payload = authUtils.verifyAccessToken(token);
    if (!payload) {
      return {
        ...request,
        isAuthenticated: false,
        response: NextResponse.json(
          { success: false, error: 'Invalid or expired token' },
          { status: 401 }
        ),
      };
    }

    // Get user from database
    const user = await User.findById(payload.userId);
    if (!user) {
      return {
        ...request,
        isAuthenticated: false,
        response: NextResponse.json(
          { success: false, error: 'User not found' },
          { status: 401 }
        ),
      };
    }

    // Check if user is locked
    if (user.isLocked()) {
      return {
        ...request,
        isAuthenticated: false,
        response: NextResponse.json(
          { success: false, error: 'Account is temporarily locked' },
          { status: 423 }
        ),
      };
    }

    // Check if email is verified (for certain routes)
    const protectedRoutes = ['/api/posts', '/api/chat', '/api/upload'];
    const isProtectedRoute = protectedRoutes.some(route =>
      request.nextUrl.pathname.startsWith(route)
    );

    if (isProtectedRoute && !user.emailVerified) {
      return {
        ...request,
        isAuthenticated: false,
        response: NextResponse.json(
          { success: false, error: 'Email verification required' },
          { status: 403 }
        ),
      };
    }

    return {
      ...request,
      user,
      userId: payload.userId,
      isAuthenticated: true,
    };

  } catch (error) {
    console.error('Authentication middleware error:', error);
    return {
      ...request,
      isAuthenticated: false,
      response: NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 500 }
      ),
    };
  }
}

/**
 * Role-based access control middleware
 * Checks if user has required role
 */
export function requireRole(allowedRoles: string[]) {
  return async (request: AuthenticatedRequest): Promise<NextResponse | null> => {
    if (!request.isAuthenticated || !request.user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (!allowedRoles.includes(request.user.role)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    return null; // Continue to next middleware
  };
}

/**
 * Rate limiting middleware
 * Prevents abuse of API endpoints
 */
export async function rateLimitMiddleware(
  request: NextRequest,
  action: string,
  identifier?: string
): Promise<NextResponse | null> {
  // Use IP address as default identifier
  const userIdentifier = identifier || request.ip || 'unknown';
  const window = rateLimitUtils.windows[action as keyof typeof rateLimitUtils.windows] || 60;
  const limit = rateLimitUtils.limits[action as keyof typeof rateLimitUtils.limits] || 10;

  const key = rateLimitUtils.getRateLimitKey(userIdentifier, action, window);
  const current = await redisHelpers.increment(key, window);

  // Set rate limit headers
  const headers = new Headers();
  headers.set('X-RateLimit-Limit', limit.toString());
  headers.set('X-RateLimit-Remaining', Math.max(0, limit - current).toString());
  headers.set('X-RateLimit-Reset', new Date(Date.now() + window * 1000).toISOString());

  // Check if rate limit exceeded
  if (current > limit) {
    return NextResponse.json(
      {
        success: false,
        error: `Rate limit exceeded for ${action}. Try again later.`,
        retryAfter: window,
      },
      {
        status: 429,
        headers,
      }
    );
  }

  return null; // Continue to next middleware
}

/**
 * Combined authentication and rate limiting middleware
 * Use for most API endpoints
 */
export async function protectedMiddleware(
  request: NextRequest,
  action?: string
): Promise<{ request: AuthenticatedRequest; response?: NextResponse }> {
  // Apply authentication
  const authRequest = await authMiddleware(request);

  // If authentication failed, return error response
  if (authRequest.response) {
    return { request: authRequest, response: authRequest.response };
  }

  // Apply rate limiting if action specified
  if (action && authRequest.isAuthenticated) {
    const identifier = authRequest.userId || request.ip;
    const rateLimitResponse = await rateLimitMiddleware(request, action, identifier);

    if (rateLimitResponse) {
      return { request: authRequest, response: rateLimitResponse };
    }
  }

  return { request: authRequest };
}

/**
 * WebSocket authentication middleware
 * Validates JWT tokens for WebSocket connections
 */
export async function wsAuthMiddleware(token: string | null): Promise<{ user?: IUser; error?: string }> {
  if (!token) {
    return { error: 'Authentication token required' };
  }

  try {
    // Verify JWT token
    const payload = authUtils.verifyAccessToken(token);
    if (!payload) {
      return { error: 'Invalid or expired token' };
    }

    // Get user from database
    const user = await User.findById(payload.userId);
    if (!user) {
      return { error: 'User not found' };
    }

    // Check if user is locked
    if (user.isLocked()) {
      return { error: 'Account is temporarily locked' };
    }

    return { user };

  } catch (error) {
    console.error('WebSocket authentication error:', error);
    return { error: 'Authentication failed' };
  }
}

/**
 * File upload authentication and rate limiting
 * Additional security for file upload endpoints
 */
export async function uploadMiddleware(request: NextRequest): Promise<NextResponse | null> {
  // Check authentication first
  const authRequest = await authMiddleware(request);
  if (!authRequest.isAuthenticated) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    );
  }

  // Apply stricter rate limiting for uploads
  const identifier = authRequest.userId;
  const rateLimitResponse = await rateLimitMiddleware(request, 'upload', identifier);

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // Check user permissions (basic users can upload, but with restrictions)
  if (authRequest.user?.role === 'user') {
    // Additional checks for regular users if needed
    // For now, all authenticated users can upload
  }

  return null; // Allow upload
}

/**
 * Admin-only middleware
 * Restricts access to admin users only
 */
export const adminOnly = requireRole(['admin']);

/**
 * Moderator and admin middleware
 * Restricts access to moderators and admins
 */
export const moderatorOnly = requireRole(['moderator', 'admin']);

/**
 * Helper function to get user from request
 */
export function getUserFromRequest(request: any): IUser | null {
  return request.user || null;
}

/**
 * Helper function to check if user is authenticated
 */
export function isUserAuthenticated(request: any): boolean {
  return request.isAuthenticated === true && request.user !== undefined;
}

/**
 * Helper function to check user role
 */
export function hasRole(request: any, role: string): boolean {
  return request.user?.role === role;
}

/**
 * Helper function to check if user owns resource
 */
export function ownsResource(request: any, resourceUserId: string): boolean {
  if (!request.isAuthenticated || !request.user) {
    return false;
  }

  // Admins can access any resource
  if (request.user.role === 'admin') {
    return true;
  }

  // Users can only access their own resources
  return request.user._id.toString() === resourceUserId;
}

/**
 * Error response helper
 */
export function createAuthErrorResponse(message: string, status: number = 401): NextResponse {
  return NextResponse.json(
    { success: false, error: message },
    { status }
  );
}