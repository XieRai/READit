-- =====================================================================
-- Migration: 20261018010000_security_hardening.sql
-- Description: Prevent data scraping on documents table, revoke anon grants 
--              on private tables, strip user IDs from global catalog, 
--              and add cryptographic SHA-256 prebake lookup RPC and demo RPC.
-- =====================================================================

-- 1. SECURE PREBAKE LOOKUP RPC (Cryptographic SHA-256 Verification)
-- Only clients possessing the exact SHA-256 hash of a paper can query its prebake cache.
-- This completely prevents enumeration and scraping of the documents catalog.
CREATE OR REPLACE FUNCTION public.lookup_document_prebake(hash_input text)
RETURNS TABLE (
  file_hash char(64),
  title text,
  authors jsonb,
  doi text,
  page_count int,
  prebake_context jsonb,
  is_demo_file boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT 
    d.file_hash, 
    d.title, 
    d.authors, 
    d.doi, 
    d.page_count, 
    d.prebake_context, 
    d.is_demo_file
  FROM public.documents d
  WHERE d.file_hash = hash_input
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_document_prebake(text) TO anon, authenticated;

-- 2. SECURE DEMO DOCUMENT RETRIEVAL RPC
-- Allows anonymous and authenticated users to load the built-in demo paper without granting SELECT * on documents.
CREATE OR REPLACE FUNCTION public.get_demo_document()
RETURNS TABLE (
  file_hash char(64),
  title text,
  authors jsonb,
  doi text,
  page_count int,
  prebake_context jsonb,
  storage_path text,
  is_demo_file boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT 
    d.file_hash, 
    d.title, 
    d.authors, 
    d.doi, 
    d.page_count, 
    d.prebake_context, 
    d.storage_path, 
    d.is_demo_file
  FROM public.documents d
  WHERE d.is_demo_file = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_demo_document() TO anon, authenticated;

-- 3. STOP PUBLIC SCRAPING ON PUBLIC.DOCUMENTS
-- Revoke SELECT on documents from anon so crawlers/scrapers cannot enumerate papers.
REVOKE SELECT ON TABLE public.documents FROM anon;

-- 4. REMOVE USER IDS FROM GLOBAL DOCUMENTS TABLE
-- User uploaded papers are stored at `papers/<userId>/<fileHash>.pdf` in the storage bucket.
-- Global documents catalog should not store or leak uploader UUIDs.
UPDATE public.documents
SET storage_path = NULL
WHERE is_demo_file = false;

-- 5. REVOKE UNNECESSARY ANON GRANTS ON PRIVATE USER TABLES
REVOKE ALL ON TABLE public.user_saved_insights FROM anon;
REVOKE ALL ON TABLE public.user_preferences FROM anon;
REVOKE ALL ON TABLE public.user_documents FROM anon;
