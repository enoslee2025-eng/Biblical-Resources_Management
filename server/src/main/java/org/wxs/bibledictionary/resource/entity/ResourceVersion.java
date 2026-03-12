package org.wxs.bibledictionary.resource.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 资源版本历史实体
 * 每次保存资源时自动创建快照，用于版本回退
 */
@Entity
@Table(name = "resource_versions")
public class ResourceVersion extends PanacheEntityBase {

    /** 版本ID，自增 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    /** 所属资源ID */
    @Column(name = "resource_id", nullable = false)
    public Long resourceId;

    /** 操作用户ID */
    @Column(name = "user_id", nullable = false)
    public Long userId;

    /** 版本保存时的资源标题 */
    @Column(name = "title", nullable = false)
    public String title;

    /** 版本元数据快照 */
    @Column(name = "meta_json", columnDefinition = "JSON")
    public String metaJson;

    /** 版本内容快照 */
    @Column(name = "content_json", columnDefinition = "LONGTEXT")
    public String contentJson;

    /** 版本摘要快照 */
    @Column(name = "summary_json", length = 500)
    public String summaryJson;

    /** 版本序号（同一资源下递增） */
    @Column(name = "version_number", nullable = false)
    public Integer versionNumber;

    /** 创建时间 */
    @Column(name = "created_at", updatable = false)
    public LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
