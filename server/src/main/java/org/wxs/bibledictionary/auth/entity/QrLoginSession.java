package org.wxs.bibledictionary.auth.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 二维码登录会话实体
 * 管理扫码登录的整个生命周期
 */
@Entity
@Table(name = "qr_login_sessions")
public class QrLoginSession extends PanacheEntityBase {

    /** 会话ID（UUID） */
    @Id
    public String id;

    /** 验证码，用于APP扫码确认 */
    @Column(name = "code", nullable = false)
    public String code;

    /** 扫码用户的APP UID */
    @Column(name = "uid")
    public Long uid;

    /** 登录成功后生成的Token */
    @Column(name = "token")
    public String token;

    /** 状态：0-未扫码，1-已扫码未确认，2-已登录，3-已失效 */
    @Column(name = "status", columnDefinition = "TINYINT")
    public Integer status;

    /** 二维码过期时间 */
    @Column(name = "expires_at", nullable = false)
    public LocalDateTime expiresAt;

    /** 创建时间 */
    @Column(name = "created_at", updatable = false)
    public LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        if (status == null) {
            status = 0;
        }
    }

    /**
     * 判断二维码是否已过期
     */
    public boolean isExpired() {
        return LocalDateTime.now().isAfter(expiresAt);
    }
}
