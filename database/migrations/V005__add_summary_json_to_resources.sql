-- 资源表新增内容摘要缓存字段
-- 保存时自动计算，用于在列表页显示进度条（避免加载大量内容）
ALTER TABLE resources ADD COLUMN summary_json VARCHAR(500) COMMENT '资源内容摘要缓存（JSON）' AFTER content_json;
