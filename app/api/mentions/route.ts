import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Helper function to get authenticated agent from headers
function getAuthenticatedAgent(request: NextRequest): { id: string; name: string } | null {
  const agentId = request.headers.get('x-agent-id');
  const agentName = request.headers.get('x-agent-name');
  if (!agentId) return null;
  return { id: agentId, name: agentName || 'Unknown' };
}

// GET /api/mentions?agent={id} - Get unread mentions for an agent
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const authenticatedAgent = getAuthenticatedAgent(request);
    if (!authenticatedAgent) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agent');

    // Validate agent parameter
    if (!agentId) {
      return NextResponse.json(
        { success: false, error: 'Agent parameter is required' },
        { status: 400 }
      );
    }

    // Validate that the authenticated agent matches the requested agent ID
    // (or you could add admin check here if needed)
    if (authenticatedAgent.id !== agentId) {
      return NextResponse.json(
        { success: false, error: 'You can only view your own mentions' },
        { status: 403 }
      );
    }

    // Get unread mentions for the agent with related task and source agent details
    const mentions = await prisma.mention.findMany({
      where: {
        targetAgentId: agentId,
        read: false,
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
          },
        },
        sourceAgent: {
          select: {
            id: true,
            name: true,
            emoji: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Transform mentions for API response
    const transformedMentions = mentions.map((mention) => ({
      id: mention.id,
      read: mention.read,
      createdAt: mention.createdAt,
      task: mention.task
        ? {
            id: mention.task.id,
            title: mention.task.title,
          }
        : null,
      sourceAgent: {
        id: mention.sourceAgent.id,
        name: mention.sourceAgent.name,
        emoji: mention.sourceAgent.emoji,
      },
    }));

    return NextResponse.json({
      success: true,
      mentions: transformedMentions,
      count: transformedMentions.length,
    });
  } catch (error) {
    console.error('Error fetching mentions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch mentions' },
      { status: 500 }
    );
  }
}
