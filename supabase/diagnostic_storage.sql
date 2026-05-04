-- Diagnostic — find what's eating Supabase storage.
-- Run in SQL Editor; results show the heaviest tables / buckets.
-- Read-only, safe to run anytime.

-- ── 1. Top tables by total size (data + indexes + toast) ──
-- "Просто текст" weighs little; the usual culprits are recordings (audio),
-- email body HTML, cached file_url blobs, and message-history denormals.
SELECT
  schemaname || '.' || tablename AS table,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS total,
  pg_size_pretty(pg_relation_size(schemaname || '.' || tablename)) AS data,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)
                 - pg_relation_size(schemaname || '.' || tablename)) AS overhead,
  (SELECT n_live_tup FROM pg_stat_user_tables s
   WHERE s.schemaname = t.schemaname AND s.relname = t.tablename) AS row_count
FROM pg_tables t
WHERE schemaname IN ('public', 'storage')
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
LIMIT 20;

-- ── 2. Storage bucket sizes (Supabase Storage) ──
-- Each upload (file attachment, voice message, signature, stamp, КП photo)
-- lives in storage.objects. This is most likely the 5 GB hog.
SELECT
  bucket_id,
  count(*) AS files,
  pg_size_pretty(sum(coalesce((metadata->>'size')::bigint, 0))) AS total_size
FROM storage.objects
GROUP BY bucket_id
ORDER BY sum(coalesce((metadata->>'size')::bigint, 0)) DESC;

-- ── 3. Heaviest individual files in storage ──
SELECT
  bucket_id,
  name,
  pg_size_pretty((metadata->>'size')::bigint) AS size,
  created_at
FROM storage.objects
WHERE metadata ? 'size'
ORDER BY (metadata->>'size')::bigint DESC NULLS LAST
LIMIT 20;

-- ── 4. communications: total body bytes by channel ──
-- Email HTML and pasted screenshots inflate this.
SELECT
  channel,
  count(*) AS rows,
  pg_size_pretty(sum(octet_length(coalesce(body, '')))::bigint) AS body_bytes,
  pg_size_pretty(avg(octet_length(coalesce(body, '')))::bigint) AS avg_body
FROM public.communications
GROUP BY channel
ORDER BY sum(octet_length(coalesce(body, ''))) DESC NULLS LAST;

-- ── 5. Top biggest single rows in communications (often base64 images) ──
SELECT id, channel, direction, created_at,
       pg_size_pretty(octet_length(coalesce(body, ''))::bigint) AS body_size,
       left(coalesce(subject, ''), 50) AS subject
FROM public.communications
ORDER BY octet_length(coalesce(body, '')) DESC NULLS LAST
LIMIT 10;

-- ── 6. internal_messages / group_messages text columns ──
SELECT 'internal_messages' AS tbl, count(*) AS rows,
       pg_size_pretty(sum(octet_length(coalesce(body, '')))::bigint) AS body_bytes
FROM public.internal_messages
UNION ALL
SELECT 'group_messages', count(*),
       pg_size_pretty(sum(octet_length(coalesce(body, '')))::bigint)
FROM public.group_messages;
