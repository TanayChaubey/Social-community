import { NextRequest, NextResponse } from 'next/server';
import { connectDB, checkDBHealth } from '@/lib/db';
import { redisClient } from '@/lib/redis';

/**
 * Health check endpoint for monitoring and load balancers
 * Security: Basic health information, no sensitive data exposed
 * Privacy: No user data included in health checks
 * GET /api/health
 */
export async function GET(request: NextRequest) {
  try {
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: 'checking',
        redis: 'checking',
        websocket: 'unknown',
      },
      performance: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
    };

    // Check database health
    try {
      const dbHealthy = await checkDBHealth();
      healthData.services.database = dbHealthy ? 'healthy' : 'unhealthy';
    } catch (error) {
      healthData.services.database = 'error';
      healthData.status = 'degraded';
    }

    // Check Redis health
    try {
      const redisHealthy = await redisClient.healthCheck();
      healthData.services.redis = redisHealthy ? 'healthy' : 'unhealthy';
    } catch (error) {
      healthData.services.redis = 'error';
      healthData.status = 'degraded';
    }

    // Check WebSocket server (if configured)
    const wsPort = process.env.WS_PORT || 3001;
    try {
      const wsResponse = await fetch(`http://localhost:${wsPort}/health`, {
        method: 'GET',
        timeout: 3000,
      }).catch(() => null);

      if (wsResponse && wsResponse.ok) {
        healthData.services.websocket = 'healthy';
      } else {
        healthData.services.websocket = 'unhealthy';
        healthData.status = 'degraded';
      }
    } catch (error) {
      healthData.services.websocket = 'unknown';
    }

    // Determine overall status
    const unhealthyServices = Object.values(healthData.services).filter(
      service => service === 'unhealthy' || service === 'error'
    );

    if (unhealthyServices.length > 0) {
      healthData.status = unhealthyServices.includes('error') ? 'unhealthy' : 'degraded';
    }

    // Set appropriate HTTP status code
    const statusCode = healthData.status === 'healthy' ? 200 :
                      healthData.status === 'degraded' ? 200 : 503;

    return NextResponse.json(healthData, {
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

  } catch (error) {
    console.error('Health check error:', error);

    const errorResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    };

    return NextResponse.json(errorResponse, {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  }
}

/**
 * Detailed health check endpoint (for internal monitoring)
 * Security: More detailed information, still no sensitive data
 * GET /api/health/detailed
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body for optional detailed checks
    const body = await request.json().catch(() => ({}));
    const { detailed = false, includeStats = false } = body;

    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: 'checking',
        redis: 'checking',
        websocket: 'unknown',
      },
      performance: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    };

    // Detailed database check
    try {
      await connectDB();
      const dbHealthy = await checkDBHealth();
      healthData.services.database = dbHealthy ? 'healthy' : 'unhealthy';

      if (detailed && dbHealthy) {
        // Add database connection details
        healthData.services.databaseDetails = {
          connected: true,
          // Note: Don't expose sensitive connection details
        };
      }
    } catch (error) {
      healthData.services.database = 'error';
      healthData.status = 'degraded';
    }

    // Detailed Redis check
    try {
      const redisHealthy = await redisClient.healthCheck();
      healthData.services.redis = redisHealthy ? 'healthy' : 'unhealthy';

      if (detailed && redisHealthy) {
        // Add Redis connection details
        healthData.services.redisDetails = {
          connected: true,
          // Note: Don't expose sensitive connection details
        };
      }
    } catch (error) {
      healthData.services.redis = 'error';
      healthData.status = 'degraded';
    }

    // WebSocket server check with stats
    const wsPort = process.env.WS_PORT || 3001;
    try {
      const wsResponse = await fetch(`http://localhost:${wsPort}/health`, {
        method: 'GET',
        timeout: 3000,
      }).catch(() => null);

      if (wsResponse && wsResponse.ok) {
        healthData.services.websocket = 'healthy';

        if (includeStats) {
          try {
            const wsStats = await wsResponse.json();
            healthData.services.websocketStats = wsStats;
          } catch (error) {
            // Ignore stats error
          }
        }
      } else {
        healthData.services.websocket = 'unhealthy';
        healthData.status = 'degraded';
      }
    } catch (error) {
      healthData.services.websocket = 'unknown';
    }

    // Determine overall status
    const unhealthyServices = Object.values(healthData.services).filter(
      service => service === 'unhealthy' || service === 'error'
    );

    if (unhealthyServices.length > 0) {
      healthData.status = unhealthyServices.includes('error') ? 'unhealthy' : 'degraded';
    }

    // Set appropriate HTTP status code
    const statusCode = healthData.status === 'healthy' ? 200 :
                      healthData.status === 'degraded' ? 200 : 503;

    return NextResponse.json(healthData, {
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

  } catch (error) {
    console.error('Detailed health check error:', error);

    const errorResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Detailed health check failed',
    };

    return NextResponse.json(errorResponse, {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  }
}