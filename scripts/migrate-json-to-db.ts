import { prisma } from '../lib/prisma';
import { generateApiKey, hashApiKey } from '../lib/auth';
import fs from 'fs';
import path from 'path';

// Types for JSON data structures
interface JsonAgent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  focus: string;
  status: string;
  currentTask: string | null;
  lastSeen: string;
}

interface JsonTask {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  tags?: string[];
  deliverables?: string[];
  assigneeId?: string | null;
  creatorId?: string;
  createdAt?: string;
  updatedAt?: string;
  comments?: JsonComment[];
  workLogs?: JsonWorkLog[];
  mentions?: JsonMention[];
}

interface JsonComment {
  id: string;
  content: string;
  authorId: string;
  createdAt?: string;
}

interface JsonWorkLog {
  id: string;
  action: string;
  note?: string;
  agentId: string;
  createdAt?: string;
}

interface JsonMention {
  id: string;
  taskId: string;
  targetAgentId: string;
  sourceAgentId: string;
  read?: boolean;
  createdAt?: string;
}

// Status mapping from JSON to Prisma enums
const STATUS_MAP: Record<string, string> = {
  active: 'ACTIVE',
  working: 'WORKING',
  idle: 'IDLE',
  offline: 'OFFLINE',
};

const TASK_STATUS_MAP: Record<string, string> = {
  backlog: 'BACKLOG',
  todo: 'TODO',
  'in-progress': 'IN_PROGRESS',
  'in_progress': 'IN_PROGRESS',
  review: 'REVIEW',
  done: 'DONE',
  completed: 'DONE',
};

const PRIORITY_MAP: Record<string, string> = {
  urgent: 'URGENT',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

const WORK_LOG_ACTION_MAP: Record<string, string> = {
  picked: 'PICKED',
  progress: 'PROGRESS',
  blocked: 'BLOCKED',
  completed: 'COMPLETED',
  dropped: 'DROPPED',
};

// Migration statistics
interface MigrationStats {
  agentsMigrated: number;
  agentsSkipped: number;
  tasksMigrated: number;
  tasksSkipped: number;
  commentsMigrated: number;
  workLogsMigrated: number;
  mentionsMigrated: number;
  errors: string[];
  warnings: string[];
  apiKeysGenerated: Map<string, string>; // agentId -> plain text API key
}

const stats: MigrationStats = {
  agentsMigrated: 0,
  agentsSkipped: 0,
  tasksMigrated: 0,
  tasksSkipped: 0,
  commentsMigrated: 0,
  workLogsMigrated: 0,
  mentionsMigrated: 0,
  errors: [],
  warnings: [],
  apiKeysGenerated: new Map(),
};

/**
 * Reads and parses a JSON file
 */
function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) {
      stats.warnings.push(`File not found: ${filePath}`);
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    stats.errors.push(`Failed to read/parse ${filePath}: ${error}`);
    return null;
  }
}

/**
 * Maps agent status from JSON to Prisma enum
 */
function mapAgentStatus(status: string): string {
  const mapped = STATUS_MAP[status.toLowerCase()];
  if (!mapped) {
    stats.warnings.push(`Unknown agent status "${status}", defaulting to ACTIVE`);
    return 'ACTIVE';
  }
  return mapped;
}

/**
 * Maps task status from JSON to Prisma enum
 */
function mapTaskStatus(status: string): string {
  const mapped = TASK_STATUS_MAP[status.toLowerCase()];
  if (!mapped) {
    stats.warnings.push(`Unknown task status "${status}", defaulting to TODO`);
    return 'TODO';
  }
  return mapped;
}

/**
 * Maps task priority from JSON to Prisma enum
 */
function mapTaskPriority(priority: string): string {
  const mapped = PRIORITY_MAP[priority.toLowerCase()];
  if (!mapped) {
    stats.warnings.push(`Unknown priority "${priority}", defaulting to MEDIUM`);
    return 'MEDIUM';
  }
  return mapped;
}

/**
 * Maps work log action from JSON to Prisma enum
 */
function mapWorkLogAction(action: string): string {
  const mapped = WORK_LOG_ACTION_MAP[action.toLowerCase()];
  if (!mapped) {
    stats.warnings.push(`Unknown work log action "${action}", defaulting to PROGRESS`);
    return 'PROGRESS';
  }
  return mapped;
}

/**
 * Migrates agents from JSON to PostgreSQL
 */
async function migrateAgents(agents: JsonAgent[]): Promise<Map<string, string>> {
  const agentIdMap = new Map<string, string>(); // old ID -> new ID

  console.log(`\n📋 Migrating ${agents.length} agents...`);

  for (const agent of agents) {
    try {
      // Check if agent already exists by ID
      const existingAgent = await prisma.agent.findUnique({
        where: { id: agent.id },
      });

      if (existingAgent) {
        stats.agentsSkipped++;
        agentIdMap.set(agent.id, existingAgent.id);
        console.log(`  ⏭️  Agent "${agent.name}" (${agent.id}) already exists, skipping`);
        continue;
      }

      // Generate and hash API key
      const plainApiKey = generateApiKey(agent.id);
      const hashedApiKey = await hashApiKey(plainApiKey);
      stats.apiKeysGenerated.set(agent.id, plainApiKey);

      // Create agent with the original ID
      const newAgent = await prisma.agent.create({
        data: {
          id: agent.id,
          name: agent.name,
          emoji: agent.emoji || null,
          role: agent.role || null,
          focus: agent.focus || null,
          apiKeyHash: hashedApiKey,
          status: 'ACTIVE', // All imported agents set to active
        },
      });

      agentIdMap.set(agent.id, newAgent.id);
      stats.agentsMigrated++;
      console.log(`  ✅ Agent "${agent.name}" (${agent.id}) migrated`);
    } catch (error) {
      stats.errors.push(`Failed to migrate agent "${agent.id}": ${error}`);
      console.log(`  ❌ Failed to migrate agent "${agent.id}": ${error}`);
    }
  }

  return agentIdMap;
}

/**
 * Migrates tasks from JSON to PostgreSQL
 */
async function migrateTasks(
  tasks: JsonTask[],
  agentIdMap: Map<string, string>
): Promise<Map<string, string>> {
  const taskIdMap = new Map<string, string>(); // old ID -> new ID

  console.log(`\n📋 Migrating ${tasks.length} tasks...`);

  // Find a default creator (first available agent)
  const defaultCreatorId = agentIdMap.values().next().value;
  if (!defaultCreatorId) {
    stats.errors.push('No agents available to assign as task creator');
    return taskIdMap;
  }

  for (const task of tasks) {
    try {
      // Check if task already exists by title and description
      const existingTask = await prisma.task.findFirst({
        where: {
          title: task.title,
          description: task.description || null,
        },
      });

      if (existingTask) {
        stats.tasksSkipped++;
        taskIdMap.set(task.id, existingTask.id);
        console.log(`  ⏭️  Task "${task.title}" already exists, skipping`);
        continue;
      }

      // Map assignee ID if present
      let assigneeId = null;
      if (task.assigneeId && agentIdMap.has(task.assigneeId)) {
        assigneeId = agentIdMap.get(task.assigneeId)!;
      } else if (task.assigneeId) {
        stats.warnings.push(
          `Task "${task.title}" has unknown assignee "${task.assigneeId}", leaving unassigned`
        );
      }

      // Map creator ID or use default
      let creatorId = defaultCreatorId;
      if (task.creatorId && agentIdMap.has(task.creatorId)) {
        creatorId = agentIdMap.get(task.creatorId)!;
      } else if (task.creatorId) {
        stats.warnings.push(
          `Task "${task.title}" has unknown creator "${task.creatorId}", using default`
        );
      }

      // Create the task
      const newTask = await prisma.task.create({
        data: {
          title: task.title,
          description: task.description || null,
          status: mapTaskStatus(task.status) as any,
          priority: mapTaskPriority(task.priority || 'medium') as any,
          tags: task.tags || [],
          deliverables: task.deliverables || [],
          assigneeId: assigneeId,
          creatorId: creatorId,
          createdAt: task.createdAt ? new Date(task.createdAt) : undefined,
        },
      });

      taskIdMap.set(task.id, newTask.id);
      stats.tasksMigrated++;
      console.log(`  ✅ Task "${task.title}" (${newTask.id}) migrated`);

      // Migrate comments
      if (task.comments && task.comments.length > 0) {
        await migrateComments(task.comments, newTask.id, agentIdMap);
      }

      // Migrate work logs
      if (task.workLogs && task.workLogs.length > 0) {
        await migrateWorkLogs(task.workLogs, newTask.id, agentIdMap);
      }

      // Migrate mentions
      if (task.mentions && task.mentions.length > 0) {
        await migrateMentions(task.mentions, newTask.id, agentIdMap);
      }
    } catch (error) {
      stats.errors.push(`Failed to migrate task "${task.id}": ${error}`);
      console.log(`  ❌ Failed to migrate task "${task.id}": ${error}`);
    }
  }

  return taskIdMap;
}

/**
 * Migrates comments for a task
 */
async function migrateComments(
  comments: JsonComment[],
  taskId: string,
  agentIdMap: Map<string, string>
): Promise<void> {
  for (const comment of comments) {
    try {
      // Check if author exists
      const authorId = agentIdMap.get(comment.authorId);
      if (!authorId) {
        stats.warnings.push(
          `Comment has unknown author "${comment.authorId}", skipping`
        );
        continue;
      }

      // Check if comment already exists
      const existingComment = await prisma.comment.findFirst({
        where: {
          taskId: taskId,
          content: comment.content,
          authorId: authorId,
        },
      });

      if (existingComment) {
        continue; // Skip duplicate
      }

      await prisma.comment.create({
        data: {
          content: comment.content,
          taskId: taskId,
          authorId: authorId,
          createdAt: comment.createdAt ? new Date(comment.createdAt) : undefined,
        },
      });

      stats.commentsMigrated++;
    } catch (error) {
      stats.errors.push(`Failed to migrate comment: ${error}`);
    }
  }
}

/**
 * Migrates work logs for a task
 */
async function migrateWorkLogs(
  workLogs: JsonWorkLog[],
  taskId: string,
  agentIdMap: Map<string, string>
): Promise<void> {
  for (const workLog of workLogs) {
    try {
      // Check if agent exists
      const agentId = agentIdMap.get(workLog.agentId);
      if (!agentId) {
        stats.warnings.push(
          `Work log has unknown agent "${workLog.agentId}", skipping`
        );
        continue;
      }

      // Check if work log already exists
      const existingWorkLog = await prisma.workLog.findFirst({
        where: {
          taskId: taskId,
          agentId: agentId,
          action: mapWorkLogAction(workLog.action) as any,
          note: workLog.note || null,
        },
      });

      if (existingWorkLog) {
        continue; // Skip duplicate
      }

      await prisma.workLog.create({
        data: {
          action: mapWorkLogAction(workLog.action) as any,
          note: workLog.note || null,
          taskId: taskId,
          agentId: agentId,
          createdAt: workLog.createdAt ? new Date(workLog.createdAt) : undefined,
        },
      });

      stats.workLogsMigrated++;
    } catch (error) {
      stats.errors.push(`Failed to migrate work log: ${error}`);
    }
  }
}

/**
 * Migrates mentions for a task
 */
async function migrateMentions(
  mentions: JsonMention[],
  taskId: string,
  agentIdMap: Map<string, string>
): Promise<void> {
  for (const mention of mentions) {
    try {
      // Check if both agents exist
      const targetAgentId = agentIdMap.get(mention.targetAgentId);
      const sourceAgentId = agentIdMap.get(mention.sourceAgentId);

      if (!targetAgentId) {
        stats.warnings.push(
          `Mention has unknown target agent "${mention.targetAgentId}", skipping`
        );
        continue;
      }

      if (!sourceAgentId) {
        stats.warnings.push(
          `Mention has unknown source agent "${mention.sourceAgentId}", skipping`
        );
        continue;
      }

      // Check if mention already exists
      const existingMention = await prisma.mention.findFirst({
        where: {
          taskId: taskId,
          targetAgentId: targetAgentId,
          sourceAgentId: sourceAgentId,
        },
      });

      if (existingMention) {
        continue; // Skip duplicate
      }

      await prisma.mention.create({
        data: {
          read: mention.read || false,
          taskId: taskId,
          targetAgentId: targetAgentId,
          sourceAgentId: sourceAgentId,
          createdAt: mention.createdAt ? new Date(mention.createdAt) : undefined,
        },
      });

      stats.mentionsMigrated++;
    } catch (error) {
      stats.errors.push(`Failed to migrate mention: ${error}`);
    }
  }
}

/**
 * Outputs the migration summary
 */
function printSummary(): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(60));

  console.log('\n✅ Records Migrated:');
  console.log(`   Agents:    ${stats.agentsMigrated}`);
  console.log(`   Tasks:     ${stats.tasksMigrated}`);
  console.log(`   Comments:  ${stats.commentsMigrated}`);
  console.log(`   Work Logs: ${stats.workLogsMigrated}`);
  console.log(`   Mentions:  ${stats.mentionsMigrated}`);

  console.log('\n⏭️  Records Skipped (already existed):');
  console.log(`   Agents: ${stats.agentsSkipped}`);
  console.log(`   Tasks:  ${stats.tasksSkipped}`);

  if (stats.apiKeysGenerated.size > 0) {
    console.log('\n🔑 Generated API Keys (save these!):');
    for (const [agentId, apiKey] of stats.apiKeysGenerated) {
      console.log(`   ${agentId}: ${apiKey}`);
    }
  }

  if (stats.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    for (const warning of stats.warnings) {
      console.log(`   - ${warning}`);
    }
  }

  if (stats.errors.length > 0) {
    console.log('\n❌ Errors:');
    for (const error of stats.errors) {
      console.log(`   - ${error}`);
    }
  }

  console.log('\n' + '='.repeat(60));

  if (stats.errors.length > 0) {
    console.log('❌ Migration completed with errors');
  } else if (stats.warnings.length > 0) {
    console.log('✅ Migration completed with warnings');
  } else {
    console.log('✅ Migration completed successfully');
  }
}

/**
 * Main migration function
 */
async function migrateData(): Promise<void> {
  console.log('🚀 Starting JSON to PostgreSQL migration...\n');

  const dataDir = path.join(process.cwd(), 'data');

  // Read JSON files
  const agents = readJsonFile<JsonAgent[]>(path.join(dataDir, 'agents.json')) || [];
  const tasks = readJsonFile<JsonTask[]>(path.join(dataDir, 'tasks.json')) || [];

  console.log(`📁 Found ${agents.length} agents and ${tasks.length} tasks in JSON files`);

  if (agents.length === 0 && tasks.length === 0) {
    console.log('ℹ️  No data to migrate');
    return;
  }

  // Migrate agents first (tasks depend on agents)
  const agentIdMap = await migrateAgents(agents);

  // Migrate tasks (and their related data)
  await migrateTasks(tasks, agentIdMap);

  // Print summary
  printSummary();
}

// Run migration
migrateData()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('❌ Migration failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
