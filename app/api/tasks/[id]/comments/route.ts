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

// Parse @mentions from content
// Supports patterns: @agent-name or @[Agent Name]
function parseMentions(content: string): string[] {
  const mentions: string[] = [];
  
  // Match @[Agent Name] pattern (bracketed)
  const bracketedPattern = /@\[([^\]]+)\]/g;
  let match;
  while ((match = bracketedPattern.exec(content)) !== null) {
    mentions.push(match[1]);
  }
  
  // Match @agent-name pattern (simple) - only alphanumeric and hyphens
  const simplePattern = /@([a-zA-Z0-9-]+)/g;
  while ((match = simplePattern.exec(content)) !== null) {
    // Don't add if already captured by bracketed pattern
    if (!mentions.includes(match[1])) {
      mentions.push(match[1]);
    }
  }
  
  return mentions;
}

// GET /api/tasks/[id]/comments - Get all comments for a task
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check if task exists
    const task = await prisma.task.findUnique({
      where: { id: params.id },
    });

    if (!task) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    // Get all comments with author data, ordered by createdAt ascending
    const comments = await prisma.comment.findMany({
      where: { taskId: params.id },
      include: {
        author: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Serialize comments for response
    const serializedComments = comments.map((comment) => ({
      id: comment.id,
      author: comment.author.name,
      authorId: comment.authorId,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      comments: serializedComments,
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

// POST /api/tasks/[id]/comments - Add a comment with @mentions
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
    const { content } = body;

    // Validate content
    if (!content || typeof content !== 'string' || content.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Content is required and must be non-empty' },
        { status: 400 }
      );
    }

    // Check if task exists
    const task = await prisma.task.findUnique({
      where: { id: params.id },
    });

    if (!task) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    // Create the comment
    const comment = await prisma.comment.create({
      data: {
        taskId: params.id,
        authorId: agent.id,
        content: content.trim(),
      },
      include: {
        author: true,
      },
    });

    // Parse mentions from content
    const mentionedNames = parseMentions(content);

    // Create Mention records for each mentioned agent
    for (const mentionedName of mentionedNames) {
      // Find the agent by name (case-insensitive)
      const mentionedAgent = await prisma.agent.findFirst({
        where: {
          name: {
            equals: mentionedName,
            mode: 'insensitive',
          },
        },
      });

      if (mentionedAgent) {
        // Create mention record
        await prisma.mention.create({
          data: {
            taskId: params.id,
            targetAgentId: mentionedAgent.id,
            sourceAgentId: agent.id,
            read: false,
          },
        });
      }
    }

    // Serialize comment for response
    const serializedComment = {
      id: comment.id,
      author: comment.author.name,
      authorId: comment.authorId,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
    };

    return NextResponse.json({
      success: true,
      comment: serializedComment,
      mentions: mentionedNames,
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add comment' },
      { status: 500 }
    );
  }
}
