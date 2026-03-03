import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AgentStatus } from '@prisma/client';
import { validateAdminKeySecure } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Validates if a string is a valid AgentStatus enum value
 */
function isValidStatus(status: string): status is AgentStatus {
  return Object.values(AgentStatus).includes(status as AgentStatus);
}

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * GET /api/admin/agents/[id]
 * Returns a single agent with full API key and assigned tasks
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate admin key using timing-safe comparison
    if (!validateAdminKeySecure(request)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid admin key' },
        { status: 401 }
      );
    }

    const { id } = params;

    const agent = await prisma.agent.findUnique({
      where: { id },
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
        assignedTasks: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc',
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

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        emoji: agent.emoji,
        role: agent.role,
        focus: agent.focus,
        // apiKeyHash intentionally excluded from response
        status: agent.status,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
        assignedTasks: agent.assignedTasks,
      },
    });
  } catch (error) {
    console.error('Error fetching agent (admin):', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch agent' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/agents/[id]
 * Updates an agent's fields
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate admin key using timing-safe comparison
    if (!validateAdminKeySecure(request)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid admin key' },
        { status: 401 }
      );
    }

    const { id } = params;
    const body = await request.json();
    const { name, role, emoji, email, status } = body;

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

    // Build update data
    const updateData: {
      name?: string;
      role?: string;
      emoji?: string | null;
      status?: AgentStatus;
    } = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        return NextResponse.json(
          { success: false, error: 'Name must be a non-empty string' },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }

    if (role !== undefined) {
      if (typeof role !== 'string' || role.trim() === '') {
        return NextResponse.json(
          { success: false, error: 'Role must be a non-empty string' },
          { status: 400 }
        );
      }
      updateData.role = role.trim();
    }

    if (emoji !== undefined) {
      updateData.emoji = emoji ? emoji.trim() : null;
    }

    if (status !== undefined) {
      if (!isValidStatus(status)) {
        return NextResponse.json(
          { success: false, error: `Invalid status. Valid values are: ${Object.values(AgentStatus).join(', ')}` },
          { status: 400 }
        );
      }
      updateData.status = status;
    }

    // Update agent
    const agent = await prisma.agent.update({
      where: { id },
      data: updateData,
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
      },
    });
  } catch (error) {
    console.error('Error updating agent:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update agent' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/agents/[id]
 * Deletes an agent (or deactivates by setting status to OFFLINE)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    // Delete the agent
    await prisma.agent.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting agent:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete agent' },
      { status: 500 }
    );
  }
}
