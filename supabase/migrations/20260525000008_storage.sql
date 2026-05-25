-- =============================================================================
-- Migration 008: Supabase Storage bucket policies
--
-- Buckets must be created first via Supabase Dashboard or Management API:
--   • client-documents  (private, 50 MB limit)
--   • nemt-signatures   (private, 10 MB limit)
--
-- Then apply the object-level RLS policies below.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- client-documents bucket
-- Path convention: {client_id}/{document_type}/{filename}
-- Used by: Navigator (upload + read), Family Proxy (read), Admin (full)
-- ---------------------------------------------------------------------------

CREATE POLICY "client-documents: navigator or admin insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'client-documents'
    AND (
      is_admin()
      OR (
        get_user_role() = 'navigator'
        AND (storage.foldername(name))[1]::UUID IN (
          SELECT id FROM clients WHERE navigator_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "client-documents: navigator, family_proxy, or admin select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'client-documents'
    AND (
      is_admin()
      OR (
        get_user_role() = 'navigator'
        AND (storage.foldername(name))[1]::UUID IN (
          SELECT id FROM clients WHERE navigator_id = auth.uid()
        )
      )
      OR (
        get_user_role() = 'family_proxy'
        AND (storage.foldername(name))[1]::UUID = (
          SELECT client_id FROM family_proxies WHERE id = auth.uid() LIMIT 1
        )
      )
    )
  );

CREATE POLICY "client-documents: admin delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'client-documents'
    AND is_admin()
  );

-- ---------------------------------------------------------------------------
-- nemt-signatures bucket
-- Path convention: {nemt_trip_id}/signature.png
-- Written by: Driver (at pickup/dropoff), Admin
-- Read by:    Navigator of that client, Admin
-- ---------------------------------------------------------------------------

CREATE POLICY "nemt-signatures: driver or admin insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'nemt-signatures'
    AND (
      is_admin()
      OR (
        get_user_role() = 'driver'
        AND (storage.foldername(name))[1]::UUID IN (
          SELECT id FROM nemt_trips WHERE driver_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "nemt-signatures: navigator or admin select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'nemt-signatures'
    AND (
      is_admin()
      OR (
        get_user_role() = 'navigator'
        AND (storage.foldername(name))[1]::UUID IN (
          SELECT nt.id FROM nemt_trips nt
          JOIN clients c ON c.id = nt.client_id
          WHERE c.navigator_id = auth.uid()
        )
      )
      OR (
        -- driver can re-read their own uploaded signature
        get_user_role() = 'driver'
        AND (storage.foldername(name))[1]::UUID IN (
          SELECT id FROM nemt_trips WHERE driver_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "nemt-signatures: admin delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'nemt-signatures'
    AND is_admin()
  );
