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

// GET /api/tasks - List all tasks with optional filters
// Authentication is optional for public read (middleware handles this)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');
    const assigneeId = searchParams.get('assignee');
    const priorityParam = searchParams.get('priority');

    // Build where clause for filters
    const where: {
      status?: TaskStatus;
      assigneeId?: string;
      priority?: TaskPriority;
    } = {};

    if (statusParam) {
      const status = parseTaskStatus(statusParam);
      if (status) where.status = status;
    }

    if (assigneeId) {
      where.assigneeId = assigneeId;
    }

    if (priorityParam) {
      const priority = parseTaskPriority(priorityParam);
      if (priority) where.priority = priority;
    }

    const tasks = await prisma.task.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
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
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Serialize tasks for API response
    const serializedTasks = tasks.map((task) => ({
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
    }));

    return NextResponse.json({
      success: true,
      tasks: serializedTasks,
      count: serializedTasks.length,
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

// POST /api/tasks - Create a new task
// Requires authentication
export async function POST(request: NextRequest) {
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
    const { title, description, priority, assigneeId, tags, deliverables } = body;

    // Validate required fields
    if (!title) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: title' },
        { status: 400 }
      );
    }

    // Validate priority
    let taskPriority: TaskPriority = TaskPriority.MEDIUM;
    if (priority) {
      const parsed = parseTaskPriority(priority);
      if (!parsed) {
        return NextResponse.json(
          { success: false, error: 'Invalid priority. Must be: low, medium, high, or urgent' },
          { status: 400 }
        );
      }
      taskPriority = parsed;
    }

    // Create task with Prisma
    const task = await prisma.task.create({
      data: {
        title,
        description: description || null,
        status: TaskStatus.BACKLOG,
        priority: taskPriority,
        assigneeId: assigneeId || null,
        creatorId: agent.id,
        tags: tags || [],
        deliverables: deliverables || [],
      },
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

    return NextResponse.json(
      {
        success: true,
        task: serializedTask,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create task' },
      { status: 500 }
    );
  }
}
