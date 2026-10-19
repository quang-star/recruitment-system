-- Scores belong to revocable application projections, not permanent notification history.
UPDATE notifications
SET message = 'Mở hồ sơ ứng tuyển để xem kết quả khi quyền chia sẻ còn hiệu lực.',
    version = version + 1
WHERE type = 'MATCHING_COMPLETED';
