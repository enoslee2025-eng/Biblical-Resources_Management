-- 资源版本历史表
-- 每次保存自动创建版本快照，最多保留 50 个版本
CREATE TABLE IF NOT EXISTS resource_versions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '版本ID',
    resource_id BIGINT NOT NULL COMMENT '所属资源ID',
    user_id BIGINT NOT NULL COMMENT '操作用户ID',
    title VARCHAR(255) NOT NULL COMMENT '版本保存时的资源标题',
    meta_json JSON COMMENT '版本元数据快照',
    content_json LONGTEXT COMMENT '版本内容快照',
    summary_json VARCHAR(500) COMMENT '版本摘要快照',
    version_number INT NOT NULL COMMENT '版本序号（同一资源下递增）',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_resource_id (resource_id),
    INDEX idx_user_id (user_id),
    INDEX idx_resource_version (resource_id, version_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资源版本历史表';
