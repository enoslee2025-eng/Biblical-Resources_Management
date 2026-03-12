package org.wxs.bibledictionary.resource.dto;

import org.wxs.bibledictionary.resource.entity.Resource;
import java.time.LocalDateTime;

/**
 * 资源详情 DTO
 * 包含完整的 content_json，用于编辑和导出
 */
public class ResourceDetailDTO {

    /** 资源ID */
    public Long id;

    /** 资源类型 */
    public String type;

    /** 资源标题 */
    public String title;

    /** 资源元数据 */
    public String metaJson;

    /** 资源内容（完整JSON） */
    public String contentJson;

    /** 是否公开 */
    public Integer isPublic;

    /** 版本号 */
    public Integer version;

    /** 创建时间 */
    public LocalDateTime createdAt;

    /** 更新时间 */
    public LocalDateTime updatedAt;

    /**
     * 从实体转换为详情 DTO（含内容）
     */
    public static ResourceDetailDTO fromEntity(Resource entity) {
        ResourceDetailDTO dto = new ResourceDetailDTO();
        dto.id = entity.id;
        dto.type = entity.type;
        dto.title = entity.title;
        dto.metaJson = entity.metaJson;
        dto.contentJson = entity.contentJson;
        dto.isPublic = entity.isPublic;
        dto.version = entity.version;
        dto.createdAt = entity.createdAt;
        dto.updatedAt = entity.updatedAt;
        return dto;
    }
}
