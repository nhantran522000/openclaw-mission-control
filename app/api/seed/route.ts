import { NextRequest, NextResponse } from "next/server";
import { validateAdminKeySecure } from "@/lib/auth";
import { runSeed, disconnectPrisma } from "@/prisma/seed";

export const dynamic = "force-dynamic";

// POST /api/seed - Run database seed script
export async function POST(request: NextRequest) {
  try {
    // Validate admin key - requires admin authentication
    if (!validateAdminKeySecure(request)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid admin key' },
        { status: 401 }
      );
    }

    // Run the seed function directly
    const result = await runSeed();

    // Disconnect Prisma after seeding
    await disconnectPrisma();

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to seed database" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Database seeded successfully",
      agentsCreated: result.credentials.length,
      // Note: credentials are intentionally not returned in the API response
      // for security reasons. Check server logs for API keys.
    });
  } catch (error) {
    console.error("Error seeding database:", error);
    return NextResponse.json(
      { success: false, error: "Failed to seed database" },
      { status: 500 }
    );
  }
}
