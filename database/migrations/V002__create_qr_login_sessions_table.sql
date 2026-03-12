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
