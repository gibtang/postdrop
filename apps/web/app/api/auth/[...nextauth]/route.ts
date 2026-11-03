import { handlers } from "@/auth";
import { withApiErrors } from "@/lib/api-errors";

export const GET = withApiErrors("api/auth", handlers.GET);
export const POST = withApiErrors("api/auth", handlers.POST);

export const runtime = "nodejs";
