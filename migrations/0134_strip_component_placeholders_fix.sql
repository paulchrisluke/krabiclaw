-- 0133's placeholder-strip UPDATE guarded its WHERE clause against the raw
-- `data_json` column using char(10)||char(10) (literal newline bytes), but
-- JSON encodes embedded newlines inside string values as the two-character
-- escape \n, not real newline bytes. That guard could never match anything,
-- so 0133 silently did nothing on every environment it ran on, including
-- staging - the literal `{{component type="faq"}}` text is still live on
-- the real NCLS blog post today. Re-run the same cleanup with the WHERE
-- clause checking the decoded value via json_extract instead, matching what
-- the SET clause already did correctly.
UPDATE `content_blocks`
SET `data_json` = json_set(
  `data_json`, '$.markdown',
  trim(
    replace(
      replace(json_extract(`data_json`, '$.markdown'), char(10) || char(10) || '{{component type="faq"}}', ''),
      char(10) || char(10) || '{{component type="how_to"}}', ''
    )
  )
)
WHERE `type` = 'markdown'
  AND (
    json_extract(`data_json`, '$.markdown') LIKE '%' || char(10) || char(10) || '{{component type="faq"}}%'
    OR json_extract(`data_json`, '$.markdown') LIKE '%' || char(10) || char(10) || '{{component type="how_to"}}%'
  );--> statement-breakpoint
