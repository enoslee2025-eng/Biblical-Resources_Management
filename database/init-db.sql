-- ============================================
-- 数据库初始化脚本
-- 圣经资源制作平台 - MVP 第一阶段
-- ============================================

-- 用户表（ID 来自主内圣经 APP 的 UID）
CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY COMMENT '用户ID，来自APP的UID',
    token VARCHAR(255) COMMENT '登录Token',
    token_expires_at DATETIME COMMENT 'Token过期时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 二维码登录会话表
CREATE TABLE IF NOT EXISTS qr_login_sessions (
    id VARCHAR(50) PRIMARY KEY COMMENT '会话ID（UUID）',
    code VARCHAR(20) NOT NULL COMMENT '验证码，用于APP扫码确认',
    uid BIGINT NULL COMMENT '扫码用户的APP UID',
    token VARCHAR(255) NULL COMMENT '登录成功后生成的Token',
    status TINYINT DEFAULT 0 COMMENT '状态：0-未扫码，1-已扫码未确认，2-已登录，3-已失效',
    expires_at DATETIME NOT NULL COMMENT '二维码过期时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_status (status),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='二维码登录会话表';

-- 资源表（圣经译本、注释、词典）
CREATE TABLE IF NOT EXISTS resources (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '资源ID',
    user_id BIGINT NOT NULL COMMENT '创建者用户ID',
    type VARCHAR(20) NOT NULL COMMENT '资源类型：bible-圣经译本，commentary-注释，dictionary-词典',
    title VARCHAR(255) NOT NULL COMMENT '资源标题',
    meta_json JSON COMMENT '资源元数据（JSON格式）',
    content_json LONGTEXT COMMENT '资源内容（JSON格式）',
    summary_json VARCHAR(500) COMMENT '资源内容摘要缓存（JSON）',
    is_public TINYINT DEFAULT 0 COMMENT '是否公开：0-私有，1-公开',
    version INT DEFAULT 1 COMMENT '版本号',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_user_id (user_id),
    INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资源表';

-- 管理员用户表
CREATE TABLE IF NOT EXISTS admin_users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '管理员ID',
    username VARCHAR(50) NOT NULL COMMENT '用户名',
    password VARCHAR(255) NOT NULL COMMENT '密码（BCrypt加密）',
    nickname VARCHAR(50) COMMENT '昵称',
    status TINYINT DEFAULT 1 COMMENT '状态：0-禁用，1-正常',
    token VARCHAR(255) COMMENT '登录Token',
    token_expires_at DATETIME COMMENT 'Token过期时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_username (username),
    INDEX idx_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='管理员用户表';

-- 资源版本历史表
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

-- 插入默认管理员账号（密码: admin123，BCrypt加密）
INSERT IGNORE INTO admin_users (username, password, nickname) VALUES
('admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', '超级管理员');
