-- =====================================================================
-- Migration: 20261018000000_streamline_schema.sql
-- Description: Streamline schema - drop sentence cache, lexical terms, 
--              and document shares; add prebake_context & user_saved_insights.
-- =====================================================================

-- 1. DROP OBSOLETE SHARING, CACHING & LEXICAL TABLES
DROP TABLE IF EXISTS "public"."document_shares" CASCADE;
DROP TABLE IF EXISTS "public"."sentence_cache" CASCADE;
DROP TABLE IF EXISTS "public"."lexical_terms" CASCADE;
DROP TYPE IF EXISTS "cefr_tier" CASCADE;
DROP TYPE IF EXISTS "access_role" CASCADE;

-- 2. CLEAN USER PREFERENCES (Remove unused CEFR highlight & font scale)
ALTER TABLE "public"."user_preferences" DROP COLUMN IF EXISTS "auto_highlight_cefr";
ALTER TABLE "public"."user_preferences" DROP COLUMN IF EXISTS "font_size_scale";

-- 3. UPDATE DOCUMENTS (Nullable storage_path & add prebake_context JSONB)
ALTER TABLE "public"."documents" ALTER COLUMN "storage_path" DROP NOT NULL;
ALTER TABLE "public"."documents" ADD COLUMN IF NOT EXISTS "prebake_context" jsonb;

-- Allow authenticated users to update document prebake data
DO $$ BEGIN
  CREATE POLICY "Users can update documents" ON "public"."documents"
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 4. UPDATE USER DOCUMENTS (Page-based progress tracking)
ALTER TABLE "public"."user_documents" ADD COLUMN IF NOT EXISTS "last_read_page" int NOT NULL DEFAULT 1;
ALTER TABLE "public"."user_documents" DROP COLUMN IF EXISTS "last_read_sentence_id";

-- 5. CREATE USER SAVED INSIGHTS (Personal Research Notebook with Page Deep-linking)
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

CREATE INDEX IF NOT EXISTS "idx_saved_insights_user" ON "public"."user_saved_insights"("user_id");
CREATE INDEX IF NOT EXISTS "idx_saved_insights_doc" ON "public"."user_saved_insights"("file_hash");

ALTER TABLE "public"."user_saved_insights" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own saved insights" ON "public"."user_saved_insights"
    FOR ALL TO authenticated
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

GRANT ALL ON TABLE "public"."user_saved_insights" TO authenticated;
GRANT SELECT ON TABLE "public"."user_saved_insights" TO anon;

-- 6. HARDEN SECURITY DEFINER FUNCTION
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

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 7. PAPERS STORAGE BUCKET & PRIVATE PER-USER OBJECT RLS
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

