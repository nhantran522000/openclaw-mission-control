'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AGENT_CONFIG } from '@/lib/config';
import { setApiKey, getAgentId } from '@/lib/api-client';
import type { AgentId } from '@/lib/config';

export default function LoginPage() {
  const router = useRouter();
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [apiKey, setApiKeyState] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isClient, setIsClient] = useState<boolean>(false);

  // Ensure we're on the client side for hydration
  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate inputs
    if (!selectedAgent) {
      setError('Please select an agent');
      return;
    }

    if (!apiKey.trim()) {
      setError('Please enter your API key');
      return;
    }

    // Validate that the API key matches the selected agent
    const agentIdFromKey = getAgentId(apiKey);
    if (agentIdFromKey !== selectedAgent) {
      setError('API key does not match the selected agent');
      return;
    }

    setIsLoading(true);

    try {
      // Test the API key by making a request to /api/tasks
      const response = await fetch('/api/tasks', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
      });

      if (response.ok) {
        // Save API key to localStorage and redirect
        setApiKey(apiKey);
        router.push('/');
      } else if (response.status === 401) {
        const data = await response.json().catch(() => ({}));
        setError(data.error || 'Invalid API key');
      } else {
        setError('Authentication failed. Please try again.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Connection error. Please check your network and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isClient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-pulse text-text-secondary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="text-3xl">🚀</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-text-primary tracking-wider">
            {AGENT_CONFIG.brand.name}
          </h1>
          <p className="font-body text-text-secondary mt-1">
            {AGENT_CONFIG.brand.subtitle}
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-surface-elevated rounded-xl border border-border p-6 shadow-lg">
          <h2 className="font-display text-lg font-semibold text-text-primary mb-6 tracking-wide">
            Agent Login
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Agent Selection */}
            <div>
              <label
                htmlFor="agent"
                className="block font-body text-sm font-medium text-text-secondary mb-2"
              >
                Select Agent
              </label>
              <select
                id="agent"
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary font-body focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors appearance-none cursor-pointer"
                disabled={isLoading}
              >
                <option value="">Choose your agent identity...</option>
                {AGENT_CONFIG.agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.emoji} {agent.name} — {agent.role}
                  </option>
                ))}
              </select>
            </div>

            {/* API Key Input */}
            <div>
              <label
                htmlFor="apiKey"
                className="block font-body text-sm font-medium text-text-secondary mb-2"
              >
                API Key
              </label>
              <div className="relative">
                <input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKeyState(e.target.value)}
                  placeholder="Enter your API key..."
                  className="w-full px-4 py-3 pr-12 bg-surface border border-border rounded-lg text-text-primary font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  disabled={isLoading}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors"
                  tabIndex={-1}
                >
                  {showApiKey ? (
                    <svg
                      className="w-5 h-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <line
                        x1="1"
                        y1="1"
                        x2="23"
                        y2="23"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="mt-2 text-xs text-text-secondary font-body">
                Your API key was generated in the admin panel. Format:{' '}
                <code className="text-primary">agentId_uuid</code>
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 rounded-lg">
                <svg
                  className="w-5 h-5 text-danger flex-shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-sm text-danger font-body">{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-white font-display font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>Login</span>
                </>
              )}
            </button>
          </form>

          {/* Admin Link */}
          <div className="mt-6 pt-5 border-t border-border text-center">
            <p className="text-sm text-text-secondary font-body">
              Need an API key?{' '}
              <a
                href="/admin"
                className="text-primary hover:text-primary/80 transition-colors font-medium"
              >
                Get one from Admin Panel
              </a>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center mt-6 text-xs text-text-secondary font-body">
          OpenClaw Mission Control • AI Agent Task Management
        </p>
      </div>
    </div>
  );
}
