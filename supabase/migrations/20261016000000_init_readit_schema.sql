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

DO $$ BEGIN
  CREATE TYPE "cefr_tier" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "access_role" AS ENUM ('viewer', 'commenter', 'editor');
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
  "auto_highlight_cefr" boolean NOT NULL DEFAULT true,
  "font_size_scale" real NOT NULL DEFAULT 1.0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- 3. GLOBAL DOCUMENTS (De-duplicated by SHA-256)
CREATE TABLE IF NOT EXISTS "public"."documents" (
  "file_hash" char(64) PRIMARY KEY,
  "storage_path" text NOT NULL,
  "title" text NOT NULL,
  "authors" jsonb DEFAULT '[]'::jsonb,
  "doi" text,
  "page_count" int NOT NULL DEFAULT 1,
  "parsed_structure" jsonb,
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
  "last_read_sentence_id" text,
  "progress_pct" int NOT NULL DEFAULT 0,
  "is_archived" boolean NOT NULL DEFAULT false,
  "last_opened_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_user_document" UNIQUE ("user_id", "file_hash")
);

-- 5. SENTENCE CACHE & LEXICAL TERMS
CREATE TABLE IF NOT EXISTS "public"."sentence_cache" (
  "cache_key" char(64) PRIMARY KEY,
  "file_hash" char(64) NOT NULL REFERENCES public.documents(file_hash) ON DELETE CASCADE,
  "sentence_id" text NOT NULL,
  "target_language" varchar(10) NOT NULL DEFAULT 'en',
  "translating_idea" jsonb NOT NULL,
  "quick_reference" jsonb,
  "hit_count" int NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."lexical_terms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lemma" text UNIQUE NOT NULL,
  "pos" varchar(20) NOT NULL,
  "cefr" cefr_tier NOT NULL,
  "translations" jsonb NOT NULL
);

-- 6. SHARING & COLLABORATION
CREATE TABLE IF NOT EXISTS "public"."document_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_document_id" uuid NOT NULL REFERENCES public.user_documents(id) ON DELETE CASCADE,
  "shared_by_user_id" uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  "shared_with_email" text NOT NULL,
  "role" access_role NOT NULL DEFAULT 'viewer',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- 7. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS "idx_user_docs_user_id" ON "public"."user_documents"("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_docs_file_hash" ON "public"."user_documents"("file_hash");
CREATE INDEX IF NOT EXISTS "idx_sentence_cache_lookup" ON "public"."sentence_cache"("file_hash", "sentence_id");
CREATE INDEX IF NOT EXISTS "idx_shares_user_doc" ON "public"."document_shares"("user_document_id");
CREATE INDEX IF NOT EXISTS "idx_shares_shared_with" ON "public"."document_shares"("shared_with_email");

-- 8. ROW LEVEL SECURITY (RLS)
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sentence_cache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lexical_terms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."document_shares" ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Users can read own profile" ON "public"."users"
  FOR SELECT TO authenticated USING ((select auth.uid()) = id);

CREATE POLICY "Users can update own profile" ON "public"."users"
  FOR UPDATE TO authenticated USING ((select auth.uid()) = id);

CREATE POLICY "Users manage own preferences" ON "public"."user_preferences"
  FOR ALL TO authenticated USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can manage own documents" ON "public"."user_documents"
  FOR ALL TO authenticated USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can view shared documents" ON "public"."user_documents"
  FOR SELECT TO authenticated USING (
    id IN (
      SELECT user_document_id FROM public.document_shares
      WHERE shared_with_email = (select auth.jwt()->>'email')
    )
  );

CREATE POLICY "Anyone can read documents" ON "public"."documents"
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can upload documents" ON "public"."documents"
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Anyone can read cached sentences" ON "public"."sentence_cache"
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert cached sentences" ON "public"."sentence_cache"
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Anyone can read lexical terms" ON "public"."lexical_terms"
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can view relevant document shares" ON "public"."document_shares"
  FOR SELECT TO authenticated USING (
    (select auth.uid()) = shared_by_user_id
    OR shared_with_email = (select auth.jwt()->>'email')
  );

CREATE POLICY "Users can create document shares" ON "public"."document_shares"
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = shared_by_user_id);

CREATE POLICY "Users can delete own document shares" ON "public"."document_shares"
  FOR DELETE TO authenticated USING ((select auth.uid()) = shared_by_user_id);

-- 9. AUTOMATIC USER ONBOARDING TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
