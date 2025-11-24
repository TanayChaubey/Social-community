#!/usr/bin/env node

/**
 * Health Check Script
 * Provides health status for monitoring and deployment
 */

const http = require('http');
const https = require('https');

const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const WS_PORT = process.env.WS_PORT || '3001';

async function checkEndpoint(path, name) {
  return new Promise((resolve) => {
    const url = new URL(path, APP_URL);
    const client = url.protocol === 'https:' ? https : http;

    const req = client.request(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          name,
          status: res.statusCode,
          healthy: res.statusCode >= 200 && res.statusCode < 300,
          response: res.statusCode === 200 ? JSON.parse(data) : null
        });
      });
    });

    req.on('error', (error) => {
      resolve({
        name,
        status: 'ERROR',
        healthy: false,
        error: error.message
      });
    });

    req.setTimeout(5000, () => {
      req.destroy();
      resolve({
        name,
        status: 'TIMEOUT',
        healthy: false,
        error: 'Request timeout'
      });
    });

    req.end();
  });
}

async function checkWebSocket() {
  return new Promise((resolve) => {
    const WebSocket = require('ws');
    const ws = new WebSocket(`ws://localhost:${WS_PORT}/health`);

    const timeout = setTimeout(() => {
      ws.terminate();
      resolve({
        name: 'WebSocket Server',
        status: 'TIMEOUT',
        healthy: false,
        error: 'WebSocket connection timeout'
      });
    }, 5000);

    ws.on('open', () => {
      clearTimeout(timeout);
      ws.close();
      resolve({
        name: 'WebSocket Server',
        status: 'OPEN',
        healthy: true
      });
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        name: 'WebSocket Server',
        status: 'ERROR',
        healthy: false,
        error: error.message
      });
    });
  });
}

async function checkEnvironment() {
  const required = [
    'NODE_ENV',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'MONGODB_URL',
    'REDIS_URL',
  ];

  const optional = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'S3_BUCKET_NAME',
  ];

  const missing = required.filter(key => !process.env[key]);
  const missingOptional = optional.filter(key => !process.env[key]);

  return {
    name: 'Environment Variables',
    status: missing.length === 0 ? 'OK' : 'MISSING',
    healthy: missing.length === 0,
    missing,
    missingOptional,
    configured: required.length - missing.length
  };
}

async function main() {
  console.log('🔍 Defence Brats Health Check');
  console.log('=================================');

  const checks = [
    checkEndpoint('/api/health', 'Main Health API'),
    checkEndpoint('/api/health', 'Detailed Health API'),
    checkWebSocket(),
    checkEnvironment(),
  ];

  const results = await Promise.all(checks);

  let allHealthy = true;

  console.log('\n📊 Health Check Results:');
  console.log('=================================');

  results.forEach((result, index) => {
    const status = result.healthy ? '✅' : '❌';
    const statusText = result.healthy ? 'HEALTHY' : result.status;

    console.log(`${status} ${result.name}: ${statusText}`);

    if (result.error) {
      console.log(`   Error: ${result.error}`);
      allHealthy = false;
    } else if (result.response) {
      const { data } = result.response;
      if (data.services) {
        Object.entries(data.services).forEach(([service, health]) => {
          const serviceStatus = health === 'healthy' ? '✅' : '❌';
          console.log(`   ${serviceStatus} ${service}: ${health}`);
          if (health !== 'healthy') {
            allHealthy = false;
          }
        });
      }
    } else if (result.missing) {
      console.log(`   Missing: ${result.missing.join(', ')}`);
      allHealthy = false;
    } else if (result.missingOptional) {
      console.log(`   Optional missing: ${result.missingOptional.join(', ')}`);
    }
  });

  console.log('\n📈 Summary:');
  console.log('=================================');

  if (allHealthy) {
    console.log('✅ All systems operational');
    process.exit(0);
  } else {
    console.log('❌ Some systems are not healthy');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Health check failed:', error);
    process.exit(1);
  });
}