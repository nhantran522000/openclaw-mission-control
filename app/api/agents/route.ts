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

// GET /api/agents - List all agents with status
export async function GET(request: NextRequest) {
  try {
    const agents = await prisma.agent.findMany({
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
        _count: {
          select: {
            assignedTasks: {
              where: {
                status: {
                  not: 'DONE',
                },
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    // Transform agents to include currentTaskCount and lowercase status
    const transformedAgents = agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      emoji: agent.emoji,
      role: agent.role,
      focus: agent.focus,
      status: agent.status.toLowerCase(),
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      currentTaskCount: agent._count.assignedTasks,
    }));

    return NextResponse.json({
      success: true,
      agents: transformedAgents,
      count: transformedAgents.length,
    });
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}
