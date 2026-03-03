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

// POST /api/mentions/read - Mark mentions as read
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const authenticatedAgent = getAuthenticatedAgent(request);
    if (!authenticatedAgent) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { mentionIds } = body;

    // Validate mentionIds
    if (!mentionIds || !Array.isArray(mentionIds) || mentionIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'mentionIds array is required' },
        { status: 400 }
      );
    }

    // Validate mentionIds are all strings
    if (!mentionIds.every((id: unknown) => typeof id === 'string')) {
      return NextResponse.json(
        { success: false, error: 'mentionIds must be an array of strings' },
        { status: 400 }
      );
    }

    // Only update mentions where the authenticated agent is the target
    const result = await prisma.mention.updateMany({
      where: {
        id: {
          in: mentionIds,
        },
        targetAgentId: authenticatedAgent.id,
      },
      data: {
        read: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: `${result.count} mention(s) marked as read`,
      count: result.count,
    });
  } catch (error) {
    console.error('Error marking mentions as read:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to mark mentions as read' },
      { status: 500 }
    );
  }
}
