// Agent configuration - users customize this
export const AGENT_CONFIG = {
  // Branding
  brand: {
    name: 'Mission Control',
    subtitle: 'AI Agent Command Center',
  },

  // Define your agent team here
  agents: [
    { id: 'server-admin', name: 'Server Admin', emoji: '⚙️', role: 'Orchestrator', focus: 'Agent coordination, system administration' },
    { id: 'devops', name: 'DevOps', emoji: '🔧', role: 'Operations', focus: 'CI/CD, infrastructure, deployment' },
    { id: 'qa', name: 'QA', emoji: '🔍', role: 'Quality Assurance', focus: 'Testing, quality checks' },
    { id: 'security', name: 'Security', emoji: '🛡️', role: 'Security', focus: 'Security audits, vulnerability scanning' },
    { id: 'dev-fullstack', name: 'Fullstack Dev', emoji: '💻', role: 'Engineering', focus: 'Frontend, backend, features' },
    { id: 'data-ai', name: 'Data/AI', emoji: '🤖', role: 'Data & AI', focus: 'Machine learning, data analysis' },
    { id: 'ba', name: 'BA', emoji: '📋', role: 'Business Analyst', focus: 'Requirements, analysis' },
    { id: 'architect', name: 'Architect', emoji: '🏗️', role: 'Architecture', focus: 'System design, architecture' },
    { id: 'pm', name: 'PM', emoji: '📊', role: 'Project Manager', focus: 'Project planning, management' },
  ] as const,
};

// Derive AgentId type from config
export type AgentId = typeof AGENT_CONFIG.agents[number]['id'];

// Helper to get agent by ID
export function getAgentById(id: string) {
  return AGENT_CONFIG.agents.find(a => a.id === id);
}
