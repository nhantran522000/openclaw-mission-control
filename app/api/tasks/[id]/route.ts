import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TaskStatus, TaskPriority } from '@prisma/client';

export const dynamic = 'force-dynamic';

// Helper function to get authenticated agent from headers
function getAuthenticatedAgent(request: NextRequest): { id: string; name: string } | null {
  const agentId = request.headers.get('x-agent-id');
  const agentName = request.headers.get('x-agent-name');
  if (!agentId) return null;
  return { id: agentId, name: agentName || 'Unknown' };
}

// Helper to convert Prisma enum to lowercase for API compatibility
function serializeTaskStatus(status: TaskStatus): string {
  return status.toLowerCase();
}

function serializeTaskPriority(priority: TaskPriority): string {
  return priority.toLowerCase();
}

// Helper to convert lowercase string to Prisma enum
function parseTaskStatus(status: string): TaskStatus | null {
  const upperStatus = status.toUpperCase();
  if (Object.values(TaskStatus).includes(upperStatus as TaskStatus)) {
    return upperStatus as TaskStatus;
  }
  return null;
}

function parseTaskPriority(priority: string): TaskPriority | null {
  const upperPriority = priority.toUpperCase();
  if (Object.values(TaskPriority).includes(upperPriority as TaskPriority)) {
    return upperPriority as TaskPriority;
  }
  return null;
}

// Helper to serialize a full task with relations
function serializeTask(task: {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  deliverables: string[];
  createdAt: Date;
  updatedAt: Date;
  assigneeId: string | null;
  creatorId: string;
  assignee: {
    id: string;
    name: string;
    emoji: string | null;
    role: string | null;
  } | null;
  creator: {
    id: string;
    name: string;
  };
  comments: {
    id: string;
    content: string;
    createdAt: Date;
    authorId: string;
    author: {
      id: string;
      name: string;
    };
  }[];
  workLogs: {
    id: string;
    action: { toString(): string };
    note: string | null;
    createdAt: Date;
    agentId: string;
    agent: {
      id: string;
      name: string;
    };
  }[];
  mentions: {
    id: string;
    read: boolean;
    createdAt: Date;
    targetAgentId: string;
    sourceAgentId: string;
    targetAgent: {
      id: string;
      name: string;
    };
    sourceAgent: {
      id: string;
      name: string;
    };
  }[];
}) {
  return {
    id: task.id,
    title: task.title,
    description: task.description || '',
    status: serializeTaskStatus(task.status),
    priority: serializeTaskPriority(task.priority),
    assignee: task.assignee
      ? {
          id: task.assignee.id,
          name: task.assignee.name,
          emoji: task.assignee.emoji,
          role: task.assignee.role,
        }
      : null,
    createdBy: task.creator.name,
    creatorId: task.creatorId,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    tags: task.tags,
    deliverables: task.deliverables,
    comments: task.comments.map((comment) => ({
      id: comment.id,
      author: comment.author.name,
      authorId: comment.authorId,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
    })),
    workLog: task.workLogs.map((log) => ({
      id: log.id,
      agent: log.agent.name,
      agentId: log.agentId,
      action: log.action.toString().toLowerCase(),
      note: log.note || '',
      createdAt: log.createdAt.toISOString(),
    })),
    mentions: task.mentions.map((mention) => ({
      id: mention.id,
      read: mention.read,
      createdAt: mention.createdAt.toISOString(),
      targetAgentId: mention.targetAgentId,
      sourceAgentId: mention.sourceAgentId,
      targetAgent: mention.targetAgent.name,
      sourceAgent: mention.sourceAgent.name,
    })),
  };
}

// GET /api/tasks/[id] - Get task details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const task = await prisma.task.findUnique({
      where: { id: params.id },
      include: {
        assignee: true,
        creator: true,
        comments: {
          include: {
            author: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        workLogs: {
          include: {
            agent: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        mentions: {
          include: {
            targetAgent: true,
            sourceAgent: true,
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      task: serializeTask(task),
    });
  } catch (error) {
    console.error('Error fetching task:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch task' },
      { status: 500 }
    );
  }
}

// PATCH /api/tasks/[id] - Update task
// Requires authentication
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const agent = getAuthenticatedAgent(request);
    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if task exists
    const existingTask = await prisma.task.findUnique({
      where: { id: params.id },
    });

    if (!existingTask) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { title, description, status, priority, assigneeId, tags, deliverables } = body;

    // Build update data
    const updateData: {
      title?: string;
      description?: string | null;
      status?: TaskStatus;
      priority?: TaskPriority;
      assigneeId?: string | null;
      tags?: string[];
      deliverables?: string[];
    } = {};

    if (title !== undefined) {
      updateData.title = title;
    }

    if (description !== undefined) {
      updateData.description = description || null;
    }

    if (status !== undefined) {
      const parsedStatus = parseTaskStatus(status);
      if (!parsedStatus) {
        return NextResponse.json(
          { success: false, error: 'Invalid status. Must be: backlog, todo, in_progress, review, or done' },
          { status: 400 }
        );
      }
      updateData.status = parsedStatus;
    }

    if (priority !== undefined) {
      const parsedPriority = parseTaskPriority(priority);
      if (!parsedPriority) {
        return NextResponse.json(
          { success: false, error: 'Invalid priority. Must be: low, medium, high, or urgent' },
          { status: 400 }
        );
      }
      updateData.priority = parsedPriority;
    }

    if (assigneeId !== undefined) {
      updateData.assigneeId = assigneeId || null;
    }

    if (tags !== undefined) {
      updateData.tags = tags;
    }

    if (deliverables !== undefined) {
      // Validate deliverables array (all must be .md files)
      if (Array.isArray(deliverables)) {
        for (const d of deliverables) {
          if (typeof d === 'string' && !d.endsWith('.md')) {
            return NextResponse.json(
              { success: false, error: 'All deliverables must be .md files' },
              { status: 400 }
            );
          }
        }
      }
      updateData.deliverables = deliverables;
    }

    // Update task
    const task = await prisma.task.update({
      where: { id: params.id },
      data: updateData,
      include: {
        assignee: true,
        creator: true,
        comments: {
          include: {
            author: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        workLogs: {
          include: {
            agent: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        mentions: {
          include: {
            targetAgent: true,
            sourceAgent: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      task: serializeTask(task),
    });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update task' },
      { status: 500 }
    );
  }
}

// DELETE /api/tasks/[id] - Delete task
// Requires authentication
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const agent = getAuthenticatedAgent(request);
    if (!agent) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if task exists
    const existingTask = await prisma.task.findUnique({
      where: { id: params.id },
    });

    if (!existingTask) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    // Delete task (cascades to comments, workLogs, mentions via schema)
    await prisma.task.delete({
      where: { id: params.id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete task' },
      { status: 500 }
    );
  }
}
