-- 资源表（圣经译本、注释、词典）
CREATE TABLE IF NOT EXISTS resources (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '资源ID',
    user_id BIGINT NOT NULL COMMENT '创建者用户ID',
    type VARCHAR(20) NOT NULL COMMENT '资源类型：bible-圣经译本，commentary-注释，dictionary-词典',
    title VARCHAR(255) NOT NULL COMMENT '资源标题',
    meta_json JSON COMMENT '资源元数据（JSON格式）',
    content_json LONGTEXT COMMENT '资源内容（JSON格式）',
    is_public TINYINT DEFAULT 0 COMMENT '是否公开：0-私有，1-公开',
    version INT DEFAULT 1 COMMENT '版本号',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_user_id (user_id),
    INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资源表';
