package org.wxs.bibledictionary.auth.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 用户实体
 * ID 来自主内圣经 APP 的 UID，不自增
 */
@Entity
@Table(name = "users")
public class User extends PanacheEntityBase {

    /** 用户ID，来自APP的UID */
    @Id
    public Long id;

    /** 登录Token */
    @Column(name = "token")
    public String token;

    /** Token过期时间 */
    @Column(name = "token_expires_at")
    public LocalDateTime tokenExpiresAt;

    /** 创建时间 */
    @Column(name = "created_at", updatable = false)
    public LocalDateTime createdAt;

    /** 更新时间 */
    @Column(name = "updated_at")
    public LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
