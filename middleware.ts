import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { validateApiKey, extractAgentIdFromApiKey } from './lib/auth'

// Public routes that don't require authentication
const PUBLIC_ROUTES: string[] = [
  // Note: /api/seed removed - now requires admin authentication
]

// Routes that allow public read access (GET requests only)
const PUBLIC_READ_ROUTES = [
  '/api/agents', // Allow reading agents list
]

/**
 * Middleware for API authentication.
 * Intercepts requests to /api/* routes and validates API keys.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only handle /api/* routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Allow public routes without authentication
  if (PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'))) {
    return NextResponse.next()
  }

  // Allow public read routes for GET requests
  if (
    request.method === 'GET' &&
    PUBLIC_READ_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(route + '/')
    )
  ) {
    return NextResponse.next()
  }

  // Get the API key from the X-API-Key header
  const apiKey = request.headers.get('X-API-Key')

  // Check if API key is present
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing API key. Provide X-API-Key header.' },
      { status: 401 }
    )
  }

  // Extract agent ID from the API key
  const agentId = extractAgentIdFromApiKey(apiKey)

  if (!agentId) {
    return NextResponse.json(
      { error: 'Invalid API key format.' },
      { status: 401 }
    )
  }

  // Validate the API key against the database
  const agent = await validateApiKey(apiKey, agentId)

  if (!agent) {
    return NextResponse.json(
      { error: 'Invalid API key or agent not found.' },
      { status: 401 }
    )
  }

  // Attach agent information to request headers for downstream use
  const response = NextResponse.next()
  response.headers.set('x-agent-id', agent.id)
  response.headers.set('x-agent-name', agent.name)
  response.headers.set('x-agent-status', agent.status)

  return response
}

// Configure which routes the middleware should run on
export const config = {
  matcher: '/api/:path*',
}
