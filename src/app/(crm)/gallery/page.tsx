import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Header from "@/components/layout/Header";
import GalleryClient from "./GalleryClient";

export default async function GalleryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [{ data: folders }, { data: photos }] = await Promise.all([
    admin.from("gallery_folders").select("*").order("sort_order").order("created_at"),
    admin.from("gallery_photos").select("*").order("sort_order").order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <Header title="Галерея" />
      <main className="p-6">
        <GalleryClient initialFolders={folders ?? []} initialPhotos={photos ?? []} />
      </main>
    </>
  );
}
