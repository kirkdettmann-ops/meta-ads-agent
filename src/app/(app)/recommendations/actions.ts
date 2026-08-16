"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Approve / reject / snooze a recommendation.
 * In v1 this only changes the recommendation status. Phase 3 will call
 * the Meta Marketing API to actually execute the change.
 */
export async function updateRecommendationStatus(
  recommendationId: string,
  newStatus: "approved" | "rejected" | "snoozed",
  tenantId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_recommendation_status", {
    p_recommendation_id: recommendationId,
    p_new_status: newStatus,
    p_tenant_id: tenantId,
  });

  if (error) {
    console.error("update_recommendation_status error", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/recommendations");
  revalidatePath("/dashboard");
  return { success: true };
}
