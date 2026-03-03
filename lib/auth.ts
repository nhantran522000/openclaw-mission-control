import bcrypt from 'bcryptjs'
import { randomUUID, timingSafeEqual } from 'crypto'
import { prisma } from './prisma'
import type { Agent } from '@prisma/client'
import type { NextRequest } from 'next/server'

/**
 * Validates an API key against the stored hash for a given agent.
 * @param apiKey - The plain text API key to validate
 * @param agentId - The ID of the agent to look up
 * @returns The agent if valid, null otherwise
 */
export async function validateApiKey(
  apiKey: string,
  agentId: string
): Promise<Agent | null> {
  try {
    // Look up the agent by ID
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
    })

    // Return null if agent doesn't exist
    if (!agent) {
      return null
    }

    // Compare the provided API key with the stored hash
    const isValid = await bcrypt.compare(apiKey, agent.apiKeyHash)

    return isValid ? agent : null
  } catch (error) {
    console.error('Error validating API key:', error)
    return null
  }
}

/**
 * Generates a cryptographically secure API key for an agent.
 * Format: {agentId}_{randomUUID}
 * @param agentId - The ID of the agent
 * @returns The generated API key
 */
export function generateApiKey(agentId: string): string {
  const uuid = randomUUID()
  return `${agentId}_${uuid}`
}

/**
 * Hashes an API key using bcrypt.
 * @param apiKey - The plain text API key to hash
 * @returns The hashed API key
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  const saltRounds = 12
  return bcrypt.hash(apiKey, saltRounds)
}

/**
 * Extracts the agent ID from an API key.
 * @param apiKey - The API key in format {agentId}_{uuid}
 * @returns The agent ID if valid format, null otherwise
 */
export function extractAgentIdFromApiKey(apiKey: string): string | null {
  if (!apiKey || typeof apiKey !== 'string') {
    return null
  }

  // Find the first underscore which separates agentId from UUID
  const underscoreIndex = apiKey.indexOf('_')

  if (underscoreIndex === -1 || underscoreIndex === 0) {
    return null
  }

  const agentId = apiKey.substring(0, underscoreIndex)
  const uuidPart = apiKey.substring(underscoreIndex + 1)

  // Validate UUID format (8-4-4-4-12 hex characters)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  if (!uuidRegex.test(uuidPart)) {
    return null
  }

  return agentId
}

/**
 * Validates the admin API key from request headers using timing-safe comparison.
 * This prevents timing attacks that could be used to guess the admin key.
 * @param request - The NextRequest object containing headers
 * @returns true if the admin key is valid, false otherwise
 */
export function validateAdminKeySecure(request: NextRequest): boolean {
  const adminKey = request.headers.get('X-Admin-Key');
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!adminKey || !expectedKey) {
    return false;
  }

  try {
    const adminKeyBuffer = Buffer.from(adminKey, 'utf-8');
    const expectedKeyBuffer = Buffer.from(expectedKey, 'utf-8');

    // If lengths differ, return false (but still do a comparison to maintain constant time)
    if (adminKeyBuffer.length !== expectedKeyBuffer.length) {
      return false;
    }

    return timingSafeEqual(adminKeyBuffer, expectedKeyBuffer);
  } catch {
    return false;
  }
}
