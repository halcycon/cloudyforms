-- Migration 009: Let forms inherit organisation colours.
--
-- The form builder used to save its hard-coded defaults into every new form's
-- branding, which then overrode the organisation's colours. Remove keys that
-- still hold exactly those defaults so they fall back to the organisation
-- (primary colour) or the form theme (background / text).

UPDATE forms SET branding = json_remove(branding, '$.primaryColor')
WHERE lower(json_extract(branding, '$.primaryColor')) = '#4f46e5';

UPDATE forms SET branding = json_remove(branding, '$.backgroundColor')
WHERE lower(json_extract(branding, '$.backgroundColor')) = '#f9fafb';

UPDATE forms SET branding = json_remove(branding, '$.textColor')
WHERE lower(json_extract(branding, '$.textColor')) = '#0f172a';
