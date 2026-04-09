import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface CurrentUser {
  id: string;
  role: string;
  full_name: string;
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      if (authUser) {
        supabase.from("users").select("id, role, full_name").eq("id", authUser.id).single().then(({ data }) => {
          if (data) setUser(data as CurrentUser);
        });
      }
    });
  }, []);

  const isManager = user?.role === "manager";
  const isAdmin = user?.role === "admin" || user?.role === "supervisor";

  return { user, isManager, isAdmin };
}
