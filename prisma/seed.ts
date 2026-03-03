import { PrismaClient, AgentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AGENT_CONFIG } from '../lib/config';

const prisma = new PrismaClient();

interface AgentCredential {
  id: string;
  name: string;
  apiKey: string;
}

export interface SeedResult {
  success: boolean;
  credentials: AgentCredential[];
  error?: string;
}

/**
 * Seeds the database with agents from AGENT_CONFIG.
 * Can be called programmatically or run as a CLI script.
 * @returns SeedResult with credentials array or error
 */
export async function runSeed(): Promise<SeedResult> {
  const credentials: AgentCredential[] = [];

  try {
    console.log('Starting agent seed process...\n');

    for (const agentConfig of AGENT_CONFIG.agents) {
      // Generate raw API key
      const rawApiKey = crypto.randomUUID();

      // Hash the API key with bcrypt (10 salt rounds)
      const apiKeyHash = await bcrypt.hash(rawApiKey, 10);

      // Upsert the agent
      const agent = await prisma.agent.upsert({
        where: { id: agentConfig.id },
        update: {
          name: agentConfig.name,
          emoji: agentConfig.emoji,
          role: agentConfig.role,
          focus: agentConfig.focus,
          apiKeyHash,
          status: AgentStatus.ACTIVE,
        },
        create: {
          id: agentConfig.id,
          name: agentConfig.name,
          emoji: agentConfig.emoji,
          role: agentConfig.role,
          focus: agentConfig.focus,
          apiKeyHash,
          status: AgentStatus.ACTIVE,
        },
      });

      credentials.push({
        id: agent.id,
        name: agent.name,
        apiKey: rawApiKey,
      });

      console.log(`✓ Seeded agent: ${agent.name} (${agent.id})`);
    }

    console.log('\n========================================');
    console.log('Agent API Credentials (SAVE THESE!)');
    console.log('========================================\n');

    // Output credentials in a table format
    console.table(credentials);

    console.log('\n✅ Seed completed successfully!');
    console.log('⚠️  IMPORTANT: Save the API keys above - they cannot be retrieved later.\n');

    return { success: true, credentials };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Seed failed with error:', error);
    return { success: false, credentials: [], error: errorMessage };
  }
}

/**
 * Disconnect Prisma client
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

// CLI execution - only run when executed directly
if (require.main === module) {
  runSeed()
    .catch((error) => {
      console.error('❌ Seed failed with error:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
}
