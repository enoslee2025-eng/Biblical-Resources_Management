package org.wxs.bibledictionary.resource.dto;

import org.wxs.bibledictionary.resource.entity.Resource;
import java.time.LocalDateTime;

/**
 * 资源列表 DTO
 * 不包含 content_json（内容可能很大），用于列表展示
 */
public class ResourceDTO {

    /** 资源ID */
    public Long id;

    /** 资源类型 */
    public String type;

    /** 资源标题 */
    public String title;

    /** 资源元数据 */
    public String metaJson;

    /** 资源内容摘要缓存 */
    public String summaryJson;

    /** 是否公开 */
    public Integer isPublic;

    /** 版本号 */
    public Integer version;

    /** 创建时间 */
    public LocalDateTime createdAt;

    /** 更新时间 */
    public LocalDateTime updatedAt;

    /**
     * 从实体转换为 DTO（不含内容）
     */
    public static ResourceDTO fromEntity(Resource entity) {
        ResourceDTO dto = new ResourceDTO();
        dto.id = entity.id;
        dto.type = entity.type;
        dto.title = entity.title;
        dto.metaJson = entity.metaJson;
        dto.summaryJson = entity.summaryJson;
        dto.isPublic = entity.isPublic;
        dto.version = entity.version;
        dto.createdAt = entity.createdAt;
        dto.updatedAt = entity.updatedAt;
        return dto;
    }
}
