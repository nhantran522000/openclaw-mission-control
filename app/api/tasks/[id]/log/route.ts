import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TaskStatus, WorkLogAction } from '@prisma/client';

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

function serializeTaskPriority(priority: string): string {
  return priority.toLowerCase();
}

// POST /api/tasks/[id]/log - Agent logs work progress
export async function POST(
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

    const body = await request.json();
    const { action, message } = body;

    // Validate required fields
    if (!action || !message) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: action, message' },
        { status: 400 }
      );
    }

    // Validate action
    const validActions = ['progress', 'blocked'];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { success: false, error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
        { status: 400 }
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

    // Determine WorkLogAction and optionally update task status
    const workLogAction = action === 'progress' ? WorkLogAction.PROGRESS : WorkLogAction.BLOCKED;
    
    // If action is 'blocked', update task status to BLOCKED
    if (action === 'blocked') {
      await prisma.task.update({
        where: { id: params.id },
        data: {
          status: TaskStatus.TODO, // Using TODO as there's no BLOCKED status in TaskStatus enum
        },
      });
    }

    // Create WorkLog entry
    await prisma.workLog.create({
      data: {
        taskId: params.id,
        agentId: agent.id,
        action: workLogAction,
        note: message,
      },
    });

    // Fetch updated task with all relations
    const task = await prisma.task.findUnique({
      where: { id: params.id },
      include: {
        assignee: true,
        creator: true,
        comments: {
          include: {
            author: true,
          },
        },
        workLogs: {
          include: {
            agent: true,
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch updated task' },
        { status: 500 }
      );
    }

    // Serialize task for response
    const serializedTask = {
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
        action: log.action.toLowerCase(),
        note: log.note || '',
        createdAt: log.createdAt.toISOString(),
      })),
    };

    return NextResponse.json({
      success: true,
      task: serializedTask,
      message: 'Work logged successfully',
    });
  } catch (error) {
    console.error('Error logging work:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to log work' },
      { status: 500 }
    );
  }
}
