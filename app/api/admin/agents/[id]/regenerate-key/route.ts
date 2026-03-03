import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateApiKey, hashApiKey, validateAdminKeySecure } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * POST /api/admin/agents/[id]/regenerate-key
 * Regenerates an agent's API key
 * Returns the NEW full API key (only time it's shown)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate admin key using timing-safe comparison
    if (!validateAdminKeySecure(request)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid admin key' },
        { status: 401 }
      );
    }

    const { id } = params;

    // Check if agent exists
    const existingAgent = await prisma.agent.findUnique({
      where: { id },
    });

    if (!existingAgent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Generate new API key
    const newApiKey = generateApiKey(id);
    const newApiKeyHash = await hashApiKey(newApiKey);

    // Update agent's API key hash
    const agent = await prisma.agent.update({
      where: { id },
      data: { apiKeyHash: newApiKeyHash },
    });

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        emoji: agent.emoji,
        role: agent.role,
        status: agent.status,
        updatedAt: agent.updatedAt,
      },
      apiKey: newApiKey, // Return the full API key (only time it's shown)
      message: 'API key regenerated successfully. Save the new key - it won\'t be shown again.',
    });
  } catch (error) {
    console.error('Error regenerating API key:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to regenerate API key' },
      { status: 500 }
    );
  }
}
