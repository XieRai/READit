-- =====================================================================
-- Migration: 20261016000000_init_readit_schema.sql
-- Description: Complete READit in-situ reading environment schema
-- =====================================================================

-- 1. ENUMS
DO $$ BEGIN
  CREATE TYPE "plan_tier" AS ENUM ('free', 'pro', 'academic');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. USERS & PROFILES (Linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS "public"."users" (
  "id" uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  "email" text UNIQUE NOT NULL,
  "display_name" text,
  "avatar_url" text,
  "plan" plan_tier NOT NULL DEFAULT 'free',
  "ai_quota_used" int NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."user_preferences" (
  "user_id" uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  "target_language" varchar(10) NOT NULL DEFAULT 'en',
  "reader_theme" varchar(20) NOT NULL DEFAULT 'dark',
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- 3. GLOBAL DOCUMENTS (De-duplicated by SHA-256)
CREATE TABLE IF NOT EXISTS "public"."documents" (
  "file_hash" char(64) PRIMARY KEY,
  "storage_path" text,
  "title" text NOT NULL,
  "authors" jsonb DEFAULT '[]'::jsonb,
  "doi" text,
  "page_count" int NOT NULL DEFAULT 1,
  "parsed_structure" jsonb,
  "prebake_context" jsonb,
  "is_demo_file" boolean NOT NULL DEFAULT false,
  "last_accessed_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- 4. USER LIBRARY
CREATE TABLE IF NOT EXISTS "public"."user_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  "file_hash" char(64) NOT NULL REFERENCES public.documents(file_hash) ON DELETE CASCADE,
  "custom_title" text,
  "last_read_page" int NOT NULL DEFAULT 1,
  "progress_pct" int NOT NULL DEFAULT 0,
  "is_archived" boolean NOT NULL DEFAULT false,
  "last_opened_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_user_document" UNIQUE ("user_id", "file_hash")
);

-- 5. RESEARCH NOTEBOOK (Saved Insights & Explanations)
CREATE TABLE IF NOT EXISTS "public"."user_saved_insights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  "file_hash" char(64) NOT NULL REFERENCES public.documents(file_hash) ON DELETE CASCADE,
  "page_number" int NOT NULL DEFAULT 1,
  "selected_text" text NOT NULL,
  "lens_type" varchar(30) NOT NULL,
  "insight_data" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- 6. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS "idx_user_docs_user_id" ON "public"."user_documents"("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_docs_file_hash" ON "public"."user_documents"("file_hash");
CREATE INDEX IF NOT EXISTS "idx_saved_insights_user" ON "public"."user_saved_insights"("user_id");
CREATE INDEX IF NOT EXISTS "idx_saved_insights_doc" ON "public"."user_saved_insights"("file_hash");

-- 7. ROW LEVEL SECURITY (RLS)
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_saved_insights" ENABLE ROW LEVEL SECURITY;

-- Users RLS
CREATE POLICY "Users can read own profile" ON "public"."users"
  FOR SELECT TO authenticated USING ((select auth.uid()) = id);

CREATE POLICY "Users can update own profile" ON "public"."users"
  FOR UPDATE TO authenticated USING ((select auth.uid()) = id);

-- User Preferences RLS
CREATE POLICY "Users manage own preferences" ON "public"."user_preferences"
  FOR ALL TO authenticated USING ((select auth.uid()) = user_id);

-- User Documents RLS
CREATE POLICY "Users can manage own documents" ON "public"."user_documents"
  FOR ALL TO authenticated USING ((select auth.uid()) = user_id);

-- Documents RLS
CREATE POLICY "Anyone can read documents" ON "public"."documents"
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Authenticated users can upload documents" ON "public"."documents"
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update documents" ON "public"."documents"
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Saved Insights RLS
CREATE POLICY "Users manage own saved insights" ON "public"."user_saved_insights"
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- 8. PERMISSIONS
GRANT ALL ON TABLE "public"."user_saved_insights" TO authenticated;
GRANT SELECT ON TABLE "public"."user_saved_insights" TO anon;

-- 9. AUTOMATIC USER ONBOARDING TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url;

  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Protect SECURITY DEFINER trigger from direct PostgREST RPC execution
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 10. BACKFILL EXISTING USERS
INSERT INTO public.users (id, email, display_name, avatar_url)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1)),
  raw_user_meta_data->>'avatar_url'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_preferences (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- 11. PAPERS STORAGE BUCKET & PRIVATE PER-USER OBJECT RLS
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'papers',
  'papers',
  false,
  26214400,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Users can read own papers"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'papers' AND
    (storage.foldername(name))[1] = (select auth.uid())::text
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can upload own papers"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'papers' AND
    (storage.foldername(name))[1] = (select auth.uid())::text
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own papers"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'papers' AND
    (storage.foldername(name))[1] = (select auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'papers' AND
    (storage.foldername(name))[1] = (select auth.uid())::text
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own papers"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'papers' AND
    (storage.foldername(name))[1] = (select auth.uid())::text
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

