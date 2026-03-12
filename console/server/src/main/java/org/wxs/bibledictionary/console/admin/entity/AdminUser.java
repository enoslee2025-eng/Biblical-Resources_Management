package org.wxs.bibledictionary.console.admin.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 管理员用户实体
 * 映射 admin_users 表，存储后台管理员账号信息
 */
@Entity
@Table(name = "admin_users")
public class AdminUser extends PanacheEntityBase {

    /** 管理员ID，自增主键 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    /** 管理员用户名，唯一 */
    @Column(name = "username", nullable = false, unique = true, length = 50)
    public String username;

    /** 密码，BCrypt 加密存储 */
    @Column(name = "password", nullable = false)
    public String password;

    /** 昵称 */
    @Column(name = "nickname", length = 50)
    public String nickname;

    /** 状态：0-禁用，1-正常 */
    @Column(name = "status", columnDefinition = "TINYINT")
    public Integer status;

    /** 登录 Token */
    @Column(name = "token")
    public String token;

    /** Token 过期时间 */
    @Column(name = "token_expires_at")
    public LocalDateTime tokenExpiresAt;

    /** 创建时间 */
    @Column(name = "created_at", updatable = false)
    public LocalDateTime createdAt;

    /** 更新时间 */
    @Column(name = "updated_at")
    public LocalDateTime updatedAt;

    /**
     * 持久化前自动设置创建时间和更新时间
     */
    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
        if (status == null) status = 1;
    }

    /**
     * 更新前自动设置更新时间
     */
    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
