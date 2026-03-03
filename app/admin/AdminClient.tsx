"use client";

import { useState, useCallback, useEffect } from "react";
import { AgentStatus } from "@prisma/client";

// Types
interface SerializedAgent {
  id: string;
  name: string;
  emoji: string | null;
  role: string | null;
  status: AgentStatus;
  apiKeyMasked: string;
  assignedTasksCount: number;
  createdAt: string;
}

interface AdminStats {
  totalAgents: number;
  activeAgents: number;
  totalTasks: number;
}

interface AdminClientProps {
  agents?: SerializedAgent[];
  stats?: AdminStats;
  isAdminConfigured: boolean;
}

// Status badge colors
const STATUS_COLORS: Record<AgentStatus, { bg: string; text: string; dot: string }> = {
  ACTIVE: { bg: "bg-success/10", text: "text-success", dot: "bg-success" },
  WORKING: { bg: "bg-info/10", text: "text-info", dot: "bg-info" },
  IDLE: { bg: "bg-warning/10", text: "text-warning", dot: "bg-warning" },
  OFFLINE: { bg: "bg-gray-500/10", text: "text-gray-400", dot: "bg-gray-500" },
};

// Default stats for initial state
const DEFAULT_STATS: AdminStats = {
  totalAgents: 0,
  activeAgents: 0,
  totalTasks: 0,
};

// Mask API key to show only last 8 characters
function maskApiKey(apiKeyHash: string): string {
  if (!apiKeyHash) return "••••••••";
  if (apiKeyHash.length <= 8) {
    return "••••••••" + apiKeyHash;
  }
  return "••••••••" + apiKeyHash.slice(-8);
}

export function AdminClient({ agents: initialAgents, stats: initialStats, isAdminConfigured }: AdminClientProps) {
  const [agents, setAgents] = useState<SerializedAgent[]>(initialAgents || []);
  const [stats, setStats] = useState<AdminStats>(initialStats || DEFAULT_STATS);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Form state
  const [newAgent, setNewAgent] = useState({
    name: "",
    emoji: "🤖",
    role: "",
    email: "",
  });

  // Fetch agents data after authentication
  const fetchAgentsData = useCallback(async () => {
    setIsLoadingData(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/agents", {
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": adminKey,
        },
      });
      
      if (response.status === 401) {
        setIsAuthenticated(false);
        throw new Error("Invalid admin key");
      }
      
      if (!response.ok) {
        throw new Error("Failed to fetch agents");
      }
      
      const data = await response.json();
      
      // Transform agents to match our SerializedAgent format
      const transformedAgents = data.agents.map((agent: {
        id: string;
        name: string;
        emoji: string | null;
        role: string | null;
        status: AgentStatus;
        apiKeyHash: string;
        assignedTaskCount: number;
        createdAt: string;
      }) => ({
        id: agent.id,
        name: agent.name,
        emoji: agent.emoji || "🤖",
        role: agent.role || "Unassigned",
        status: agent.status,
        apiKeyMasked: maskApiKey(agent.apiKeyHash),
        assignedTasksCount: agent.assignedTaskCount,
        createdAt: agent.createdAt,
      }));
      
      setAgents(transformedAgents);
      
      // Calculate stats from the agents data
      setStats({
        totalAgents: transformedAgents.length,
        activeAgents: transformedAgents.filter((a: { status: AgentStatus }) =>
          ["ACTIVE", "WORKING", "IDLE"].includes(a.status)
        ).length,
        totalTasks: transformedAgents.reduce((sum: number, a: { assignedTasksCount: number }) =>
          sum + a.assignedTasksCount, 0
        ),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setIsLoadingData(false);
    }
  }, [adminKey]);

  // Fetch data when authenticated
  useEffect(() => {
    if (isAuthenticated && agents.length === 0) {
      fetchAgentsData();
    }
  }, [isAuthenticated, agents.length, fetchAgentsData]);

  // Authenticate with admin key
  const handleAuthenticate = useCallback(() => {
    if (adminKey.trim()) {
      setIsAuthenticated(true);
      setError(null);
    }
  }, [adminKey]);

  // API helper with admin key header
  const apiCall = useCallback(async (url: string, options: RequestInit = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        "Content-Type": "application/json",
        "X-Admin-Key": adminKey,
      },
    });
    
    if (response.status === 401) {
      throw new Error("Invalid admin key");
    }
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Request failed");
    }
    
    return response.json();
  }, [adminKey]);

  // Add new agent
  const handleAddAgent = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgent.name || !newAgent.role) return;

    setLoading("add");
    setError(null);

    try {
      const data = await apiCall("/api/admin/agents", {
        method: "POST",
        body: JSON.stringify({
          name: newAgent.name,
          emoji: newAgent.emoji || "🤖",
          role: newAgent.role,
          email: newAgent.email || undefined,
        }),
      });

      setAgents((prev) => [data.agent, ...prev]);
      setStats((prev) => ({
        ...prev,
        totalAgents: prev.totalAgents + 1,
        activeAgents: prev.activeAgents + 1,
      }));
      
      setNewAgent({ name: "", emoji: "🤖", role: "", email: "" });
      setShowAddForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add agent");
    } finally {
      setLoading(null);
    }
  }, [newAgent, apiCall]);

  // Regenerate API key
  const handleRegenerateKey = useCallback(async (agentId: string) => {
    setLoading(`regenerate-${agentId}`);
    setError(null);

    try {
      const data = await apiCall(`/api/admin/agents/${agentId}/regenerate-key`, {
        method: "POST",
      });

      setAgents((prev) =>
        prev.map((agent) =>
          agent.id === agentId
            ? { ...agent, apiKeyMasked: data.apiKeyMasked }
            : agent
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate key");
    } finally {
      setLoading(null);
    }
  }, [apiCall]);

  // Toggle agent status
  const handleToggleStatus = useCallback(async (agentId: string, currentStatus: AgentStatus) => {
    setLoading(`toggle-${agentId}`);
    setError(null);

    const newStatus = currentStatus === "OFFLINE" ? "IDLE" : "OFFLINE";

    try {
      await apiCall(`/api/admin/agents/${agentId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });

      setAgents((prev) =>
        prev.map((agent) =>
          agent.id === agentId ? { ...agent, status: newStatus } : agent
        )
      );

      setStats((prev) => ({
        ...prev,
        activeAgents: prev.activeAgents + (newStatus === "OFFLINE" ? -1 : 1),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setLoading(null);
    }
  }, [apiCall]);

  // Show authentication form if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="h-full overflow-auto">
        <div className="max-w-md mx-auto px-6 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-8 bg-gradient-to-b from-cyan to-violet rounded-full" />
              <h1 className="font-display text-3xl font-bold tracking-wider text-text-primary">
                ADMIN PANEL
              </h1>
            </div>
            <p className="font-body text-text-secondary ml-5">
              Authentication required to access admin features
            </p>
          </div>

          {/* Auth form */}
          <div className="relative rounded-2xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-surface to-deep" />
            <div className="absolute inset-0 rounded-2xl border border-elevated/50" />
            
            <div className="relative p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-violet/10 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-violet-bright"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold text-text-primary">
                    Admin Authentication
                  </h2>
                  <p className="font-mono text-xs text-text-muted">
                    Enter your admin API key to continue
                  </p>
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/30">
                  <p className="font-mono text-xs text-danger">{error}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block font-mono text-xs text-text-muted mb-2 uppercase tracking-wider">
                    Admin API Key
                  </label>
                  <input
                    type="password"
                    value={adminKey}
                    onChange={(e) => setAdminKey(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAuthenticate()}
                    placeholder="Enter admin key..."
                    className="w-full px-4 py-3 rounded-xl bg-deep border border-elevated/50 text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/30 font-mono text-sm"
                  />
                </div>

                <button
                  onClick={handleAuthenticate}
                  disabled={!adminKey.trim()}
                  className="w-full px-6 py-3 rounded-xl btn-glow text-void font-mono text-sm tracking-wider uppercase disabled:opacity-50 disabled:cursor-not-allowed">
                  Authenticate
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state while fetching data
  if (isLoadingData) {
    return (
      <div className="h-full overflow-auto">
        <div className="max-w-md mx-auto px-6 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-cyan/10 flex items-center justify-center animate-pulse">
                <svg
                  className="w-6 h-6 text-cyan"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
                </svg>
              </div>
              <p className="font-mono text-sm text-text-muted">Loading admin data...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-8 bg-gradient-to-b from-cyan to-violet rounded-full" />
                <h1 className="font-display text-3xl font-bold tracking-wider text-text-primary">
                  ADMIN PANEL
                </h1>
              </div>
              <p className="font-body text-text-secondary ml-5">
                Manage agents and view system statistics
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-glow text-void font-mono text-sm tracking-wider uppercase">
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Add Agent
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-danger/10 border border-danger/30 flex items-center justify-between">
            <p className="font-mono text-sm text-danger">{error}</p>
            <button onClick={() => setError(null)} className="text-danger hover:text-danger/80">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}

        {/* Statistics Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Total Agents */}
          <div className="relative group rounded-2xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-surface to-deep" />
            <div className="absolute inset-0 rounded-2xl border border-elevated/50 group-hover:border-cyan/30 transition-colors" />
            <div className="relative p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-cyan/10 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-cyan"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
                  </svg>
                </div>
              </div>
              <p className="font-display text-4xl font-bold text-text-primary">
                {stats.totalAgents}
              </p>
              <p className="font-mono text-[10px] text-text-muted tracking-wider uppercase mt-1">
                Total Agents
              </p>
            </div>
          </div>

          {/* Active Agents */}
          <div className="relative group rounded-2xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-surface to-deep" />
            <div className="absolute inset-0 rounded-2xl border border-elevated/50 group-hover:border-success/30 transition-colors" />
            <div className="relative p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                  <div className="relative">
                    <span className="absolute inline-flex h-3 w-3 rounded-full bg-success opacity-75 animate-ping" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-success" />
                  </div>
                </div>
              </div>
              <p className="font-display text-4xl font-bold text-success">
                {stats.activeAgents}
              </p>
              <p className="font-mono text-[10px] text-text-muted tracking-wider uppercase mt-1">
                Active Agents
              </p>
            </div>
          </div>

          {/* Total Tasks */}
          <div className="relative group rounded-2xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-surface to-deep" />
            <div className="absolute inset-0 rounded-2xl border border-elevated/50 group-hover:border-violet/30 transition-colors" />
            <div className="relative p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-violet/10 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-violet-bright"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
              <p className="font-display text-4xl font-bold text-violet-bright">
                {stats.totalTasks}
              </p>
              <p className="font-mono text-[10px] text-text-muted tracking-wider uppercase mt-1">
                Total Tasks
              </p>
            </div>
          </div>
        </div>

        {/* Add New Agent Form */}
        {showAddForm && (
          <div className="mb-8 relative rounded-2xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-surface to-deep" />
            <div className="absolute inset-0 rounded-2xl border border-cyan/30" />
            
            <div className="relative p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-display text-lg font-semibold tracking-wider text-text-primary uppercase">
                  Add New Agent
                </h2>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="p-2 rounded-lg hover:bg-elevated/50 text-text-muted hover:text-text-primary transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleAddAgent} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name */}
                <div>
                  <label className="block font-mono text-xs text-text-muted mb-2 uppercase tracking-wider">
                    Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={newAgent.name}
                    onChange={(e) => setNewAgent((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Agent name..."
                    required
                    className="w-full px-4 py-3 rounded-xl bg-deep border border-elevated/50 text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/30 font-body text-sm"
                  />
                </div>

                {/* Emoji */}
                <div>
                  <label className="block font-mono text-xs text-text-muted mb-2 uppercase tracking-wider">
                    Emoji
                  </label>
                  <input
                    type="text"
                    value={newAgent.emoji}
                    onChange={(e) => setNewAgent((prev) => ({ ...prev, emoji: e.target.value }))}
                    placeholder="🤖"
                    className="w-full px-4 py-3 rounded-xl bg-deep border border-elevated/50 text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/30 font-body text-sm"
                  />
                </div>

                {/* Role */}
                <div>
                  <label className="block font-mono text-xs text-text-muted mb-2 uppercase tracking-wider">
                    Role <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={newAgent.role}
                    onChange={(e) => setNewAgent((prev) => ({ ...prev, role: e.target.value }))}
                    placeholder="Agent role..."
                    required
                    className="w-full px-4 py-3 rounded-xl bg-deep border border-elevated/50 text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/30 font-body text-sm"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block font-mono text-xs text-text-muted mb-2 uppercase tracking-wider">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newAgent.email}
                    onChange={(e) => setNewAgent((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="agent@example.com..."
                    className="w-full px-4 py-3 rounded-xl bg-deep border border-elevated/50 text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/30 font-body text-sm"
                  />
                </div>

                {/* Submit button */}
                <div className="md:col-span-2 flex justify-end gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-5 py-2.5 rounded-xl bg-elevated/50 text-text-secondary hover:text-text-primary font-mono text-sm tracking-wider uppercase transition-colors">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading === "add" || !newAgent.name || !newAgent.role}
                    className="px-5 py-2.5 rounded-xl btn-glow text-void font-mono text-sm tracking-wider uppercase disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                    {loading === "add" && (
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    Create Agent
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Agent List */}
        <div className="relative rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-surface/80 to-deep/80 backdrop-blur-xl" />
          <div className="absolute inset-0 rounded-2xl border border-elevated/50" />

          <div className="relative">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-elevated/50 bg-elevated/20">
              <div className="col-span-3 font-mono text-xs text-text-muted uppercase tracking-wider">
                Agent
              </div>
              <div className="col-span-2 font-mono text-xs text-text-muted uppercase tracking-wider">
                Status
              </div>
              <div className="col-span-3 font-mono text-xs text-text-muted uppercase tracking-wider">
                API Key
              </div>
              <div className="col-span-1 font-mono text-xs text-text-muted uppercase tracking-wider text-center">
                Tasks
              </div>
              <div className="col-span-3 font-mono text-xs text-text-muted uppercase tracking-wider text-right">
                Actions
              </div>
            </div>

            {/* Agent rows */}
            {agents.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-elevated/50 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-text-muted"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
                  </svg>
                </div>
                <p className="font-mono text-sm text-text-muted">No agents found</p>
                <p className="font-body text-xs text-text-muted/70 mt-1">
                  Click &quot;Add Agent&quot; to create your first agent
                </p>
              </div>
            ) : (
              <div className="divide-y divide-elevated/30">
                {agents.map((agent) => {
                  const statusColors = STATUS_COLORS[agent.status];
                  const isLoading = loading === `regenerate-${agent.id}` || loading === `toggle-${agent.id}`;

                  return (
                    <div
                      key={agent.id}
                      className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-elevated/20 transition-colors">
                      {/* Agent info */}
                      <div className="col-span-3 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan/20 to-violet/20 flex items-center justify-center text-xl">
                          {agent.emoji || "🤖"}
                        </div>
                        <div className="min-w-0">
                          <p className="font-body text-sm font-medium text-text-primary truncate">
                            {agent.name}
                          </p>
                          <p className="font-mono text-[10px] text-text-muted truncate">
                            {agent.role || "No role"}
                          </p>
                        </div>
                      </div>

                      {/* Status */}
                      <div className="col-span-2">
                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${statusColors.bg}`}>
                          <span className={`w-2 h-2 rounded-full ${statusColors.dot}`} />
                          <span className={`font-mono text-xs ${statusColors.text}`}>
                            {agent.status}
                          </span>
                        </div>
                      </div>

                      {/* API Key */}
                      <div className="col-span-3">
                        <code className="font-mono text-xs text-text-muted bg-deep/50 px-3 py-1.5 rounded-lg block truncate">
                          {agent.apiKeyMasked}
                        </code>
                      </div>

                      {/* Tasks count */}
                      <div className="col-span-1 text-center">
                        <span className="font-mono text-sm text-text-primary">
                          {agent.assignedTasksCount}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="col-span-3 flex items-center justify-end gap-2">
                        {/* Regenerate API Key */}
                        <button
                          onClick={() => handleRegenerateKey(agent.id)}
                          disabled={isLoading}
                          className="p-2 rounded-lg bg-elevated/50 text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors disabled:opacity-50"
                          title="Regenerate API Key">
                          {loading === `regenerate-${agent.id}` ? (
                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>

                        {/* Toggle Status */}
                        <button
                          onClick={() => handleToggleStatus(agent.id, agent.status)}
                          disabled={isLoading}
                          className={`px-3 py-2 rounded-lg font-mono text-xs tracking-wider uppercase transition-colors disabled:opacity-50 ${
                            agent.status === "OFFLINE"
                              ? "bg-success/10 text-success hover:bg-success/20"
                              : "bg-danger/10 text-danger hover:bg-danger/20"
                          }`}
                          title={agent.status === "OFFLINE" ? "Activate Agent" : "Deactivate Agent"}>
                          {loading === `toggle-${agent.id}` ? (
                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : agent.status === "OFFLINE" ? (
                            "Activate"
                          ) : (
                            "Deactivate"
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
