package org.wxs.bibledictionary.resource.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 资源实体
 * 存储圣经译本、注释、词典等资源
 * meta_json 存储资源的元数据
 * content_json 存储资源的完整内容（如圣经的 books 数组）
 */
@Entity
@Table(name = "resources")
public class Resource extends PanacheEntityBase {

    /** 资源ID，自增 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    /** 创建者用户ID */
    @Column(name = "user_id", nullable = false)
    public Long userId;

    /** 资源类型：bible-圣经译本，commentary-注释，dictionary-词典 */
    @Column(name = "type", nullable = false, length = 20)
    public String type;

    /** 资源标题 */
    @Column(name = "title", nullable = false)
    public String title;

    /** 资源元数据（JSON格式） */
    @Column(name = "meta_json", columnDefinition = "JSON")
    public String metaJson;

    /** 资源内容（JSON格式，可能很大） */
    @Column(name = "content_json", columnDefinition = "LONGTEXT")
    public String contentJson;

    /** 资源内容摘要缓存（JSON格式，保存时自动计算） */
    @Column(name = "summary_json", length = 500)
    public String summaryJson;

    /** 是否公开：0-私有，1-公开 */
    @Column(name = "is_public", columnDefinition = "TINYINT")
    public Integer isPublic;

    /** 版本号 */
    @Column(name = "version")
    public Integer version;

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
        if (isPublic == null) isPublic = 0;
        if (version == null) version = 1;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
