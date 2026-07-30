"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/types";

export async function getPeople(): Promise<Person[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("people").select("*").order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createPerson(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("people").insert({ name });
  if (error) throw new Error(error.message);

  revalidatePath("/config");
}

export async function deletePerson(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("people").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/config");
}
