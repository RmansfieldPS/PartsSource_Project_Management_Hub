/* PMPM configuration.
 *
 * The app runs in DEMO MODE out of the box (no saving, no login) so you can
 * click around immediately. To make it a live, shared, multi-user app:
 *
 *   1. Create a free project at https://supabase.com
 *   2. Project Settings -> API -> copy the "Project URL" and the "anon public" key
 *   3. Paste them below (replace the YOUR-... placeholders)
 *   4. Run db/schema.sql in the Supabase SQL Editor (one time)
 *
 * The anon key is safe to commit to GitHub — it is a public client key and the
 * database is protected by Row Level Security (only signed-in users can read/write).
 */
window.PMPM_CONFIG = {
  SUPABASE_URL: "https://vwirmrlnwslgtlcbzehl.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3aXJtcmxud3NsZ3RsY2J6ZWhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MDgwMDksImV4cCI6MjEwMTA4NDAwOX0.UUfWfhJb_I5GmSjdPTUno1tvssbZvIYprPCNHBEEQck"
};
