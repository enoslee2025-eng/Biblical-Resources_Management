package org.wxs.bibledictionary.console.resource.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 资源实体（只读映射）
 * 映射 resources 表，后台管理端查看和管理资源数据
 * 存储圣经译本、注释、词典等资源
 */
@Entity
@Table(name = "resources")
public class Resource extends PanacheEntityBase {

    /** 资源ID，自增主键 */
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
}
