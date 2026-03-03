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

// GET /api/agents/[id] - Get agent details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const agent = await prisma.agent.findUnique({
      where: {
        id: params.id,
      },
      select: {
        id: true,
        name: true,
        emoji: true,
        role: true,
        focus: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        // Exclude apiKeyHash
        assignedTasks: {
          where: {
            status: {
              not: 'DONE',
            },
          },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
          },
          orderBy: {
            updatedAt: 'desc',
          },
        },
      },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Transform agent to lowercase status and format tasks
    const transformedAgent = {
      id: agent.id,
      name: agent.name,
      emoji: agent.emoji,
      role: agent.role,
      focus: agent.focus,
      status: agent.status.toLowerCase(),
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      assignedTasks: agent.assignedTasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status.toLowerCase(),
        priority: task.priority.toLowerCase(),
      })),
    };

    return NextResponse.json({
      success: true,
      agent: transformedAgent,
    });
  } catch (error) {
    console.error('Error fetching agent:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch agent' },
      { status: 500 }
    );
  }
}
