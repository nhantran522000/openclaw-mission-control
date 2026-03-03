import { AdminClient } from "./AdminClient";

// Force dynamic rendering to avoid build-time database connection issues
export const dynamic = "force-dynamic";

// Server Component - only checks configuration, does NOT fetch sensitive data
// Data fetching is handled by AdminClient after authentication
export default async function AdminPage() {
  // Verify ADMIN_API_KEY is configured (configuration validation only)
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!adminKey) {
    return <UnauthorizedMessage reason="Admin API key is not configured" />;
  }

  // Render the client component which will handle authentication and data fetching
  // This prevents data exposure before authentication
  return <AdminClient isAdminConfigured={true} />;
}

// Unauthorized message component
function UnauthorizedMessage({ reason }: { reason: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-danger/10 border border-danger/30 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-danger"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2">
            <path
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="font-display text-xl font-bold text-text-primary mb-2 tracking-wider">
          ACCESS DENIED
        </h2>
        <p className="font-body text-text-secondary mb-2">
          {reason}
        </p>
        <p className="font-mono text-xs text-text-muted">
          Set ADMIN_API_KEY environment variable to access this page.
        </p>
      </div>
    </div>
  );
}
