-- Backfill static demo company branding for pre-V24 seeded tenants
UPDATE companies
SET logo_url = '/logos/official/vnpt.png', cover_image_url = '/companies/photos/vnpt.webp'
WHERE slug = 'vnpt-net' AND (logo_url IS NULL OR logo_url = '');

UPDATE companies
SET logo_url = '/logos/official/fpt.png', cover_image_url = '/companies/photos/fpt.webp'
WHERE slug = 'fpt-software' AND (logo_url IS NULL OR logo_url = '');

UPDATE companies
SET logo_url = '/logos/official/viettel.png', cover_image_url = '/companies/photos/viettel.webp'
WHERE slug = 'viettel-solutions' AND (logo_url IS NULL OR logo_url = '');

UPDATE companies
SET logo_url = '/logos/official/vng.png', cover_image_url = '/companies/photos/vng.webp'
WHERE slug = 'vng-corporation' AND (logo_url IS NULL OR logo_url = '');

UPDATE companies
SET logo_url = '/logos/official/momo.svg', cover_image_url = '/companies/photos/momo.webp'
WHERE slug = 'momo-fintech' AND (logo_url IS NULL OR logo_url = '');

UPDATE companies
SET logo_url = '/logos/official/shopee.svg', cover_image_url = '/companies/photos/shopee.webp'
WHERE slug = 'shopee-vietnam' AND (logo_url IS NULL OR logo_url = '');

UPDATE companies
SET logo_url = '/logos/official/vpbank.svg', cover_image_url = '/companies/photos/vpbank.webp'
WHERE slug = 'vpbank-digital' AND (logo_url IS NULL OR logo_url = '');

UPDATE companies
SET logo_url = '/logos/official/techcombank.svg', cover_image_url = '/companies/photos/techcombank.webp'
WHERE slug = 'techcombank-software' AND (logo_url IS NULL OR logo_url = '');

UPDATE companies
SET logo_url = '/logos/smartrecruitment.svg', cover_image_url = '/companies/photos/workplace.webp'
WHERE slug = 'smart-recruitment-demo' AND (logo_url IS NULL OR logo_url = '');
