import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateApiKey, hashApiKey, validateAdminKeySecure } from '@/lib/auth';
import { AgentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/agents
 * Returns all agents with full API keys (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    // Validate admin key using timing-safe comparison
    if (!validateAdminKeySecure(request)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid admin key' },
        { status: 401 }
      );
    }

    const agents = await prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        emoji: true,
        role: true,
        focus: true,
        // apiKeyHash intentionally excluded - should not be exposed
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            assignedTasks: true,
            createdTasks: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    // Transform agents to include task counts
    const transformedAgents = agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      emoji: agent.emoji,
      role: agent.role,
      focus: agent.focus,
      // apiKeyHash intentionally excluded from response
      status: agent.status,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      assignedTaskCount: agent._count.assignedTasks,
      createdTaskCount: agent._count.createdTasks,
    }));

    return NextResponse.json({
      success: true,
      agents: transformedAgents,
      count: transformedAgents.length,
    });
  } catch (error) {
    console.error('Error fetching agents (admin):', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/agents
 * Creates a new agent with generated API key
 */
export async function POST(request: NextRequest) {
  try {
    // Validate admin key using timing-safe comparison
    if (!validateAdminKeySecure(request)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid admin key' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { name, role, emoji, email } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Name is required' },
        { status: 400 }
      );
    }

    if (!role || typeof role !== 'string' || role.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Role is required' },
        { status: 400 }
      );
    }

    // Generate ID and API key BEFORE creating the agent to avoid race condition
    // This ensures the agent is created with a valid hash from the start
    const agentId = randomUUID();
    const apiKey = generateApiKey(agentId);
    const apiKeyHash = await hashApiKey(apiKey);

    // Create agent with the pre-generated ID and valid hash
    const agent = await prisma.agent.create({
      data: {
        id: agentId,
        name: name.trim(),
        role: role.trim(),
        emoji: emoji?.trim() || null,
        focus: null,
        apiKeyHash,
        status: AgentStatus.ACTIVE,
      },
    });

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        emoji: agent.emoji,
        role: agent.role,
        focus: agent.focus,
        status: agent.status,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
        apiKey, // Return the full API key (only time it's shown)
      },
      message: 'Agent created successfully. Save the API key - it won\'t be shown again.',
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating agent:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create agent' },
      { status: 500 }
    );
  }
}
