-- Include job title and company name in matching notifications so users can tell which application each notification refers to.
UPDATE notifications n
SET message = 'Vị trí: ' || jv.title || ' (' || c.display_name || '). ' || n.message,
    version = n.version + 1
FROM applications a
JOIN job_versions jv ON jv.id = a.job_version_id
JOIN companies c ON c.id = a.company_id
WHERE n.type = 'MATCHING_COMPLETED'
  AND n.link_url ~ 'application=[0-9]+'
  AND a.id = substring(n.link_url FROM 'application=([0-9]+)')::BIGINT
  AND n.message = 'Mở hồ sơ ứng tuyển để xem kết quả khi quyền chia sẻ còn hiệu lực.';
