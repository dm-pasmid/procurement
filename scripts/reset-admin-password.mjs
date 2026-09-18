import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://hpkurampzbjokrdcmdph.supabase.co";
const serviceRoleKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhwa3VyYW1wemJqb2tyZGNtZHBoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzMxOTg0NiwiZXhwIjoyMDk4ODk1ODQ2fQ.mH4Q14m2uuUYMMgHiyoJOVtZ2UoqTstZtxgMopDW6wY";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function resetPassword() {
  try {
    const newPassword = "NewPassword@123";

    // List all users
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error("Error listing users:", listError);
      return;
    }

    const adminUser = users.users.find((u) => u.email === "admin@pms.local");

    if (!adminUser) {
      console.error("Admin user not found");
      return;
    }

    console.log("Found admin user:", adminUser.email);

    // Update password
    const { data, error } = await supabase.auth.admin.updateUserById(
      adminUser.id,
      { password: newPassword }
    );

    if (error) {
      console.error("Error resetting password:", error);
      return;
    }

    console.log("✓ Password reset successfully!");
    console.log("Email:", adminUser.email);
    console.log("New password:", newPassword);
  } catch (error) {
    console.error("Error:", error);
  }
}

resetPassword();
