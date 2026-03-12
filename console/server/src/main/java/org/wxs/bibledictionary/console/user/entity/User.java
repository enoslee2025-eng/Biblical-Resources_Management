package org.wxs.bibledictionary.console.user.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 用户实体（只读映射）
 * 映射 users 表，后台管理端只读查看用户数据
 * ID 来自主内圣经 APP 的 UID，不自增
 */
@Entity
@Table(name = "users")
public class User extends PanacheEntityBase {

    /** 用户ID，来自APP的UID */
    @Id
    public Long id;

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
}
