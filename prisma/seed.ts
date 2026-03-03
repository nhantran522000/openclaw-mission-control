import { PrismaClient, AgentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AGENT_CONFIG } from '../lib/config';

const prisma = new PrismaClient();

interface AgentCredential {
  id: string;
  name: string;
  apiKey: string;
}

async function main() {
  console.log('Starting agent seed process...\n');

  const credentials: AgentCredential[] = [];

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
}

main()
  .catch((error) => {
    console.error('❌ Seed failed with error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
