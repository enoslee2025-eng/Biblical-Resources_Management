package org.wxs.bibledictionary.resource.dto;

import org.wxs.bibledictionary.resource.entity.ResourceVersion;
import java.time.LocalDateTime;

/**
 * 资源版本历史 DTO
 * 列表展示时不含 contentJson（太大），仅在查看详情时返回
 */
public class ResourceVersionDTO {

    /** 版本ID */
    public Long id;

    /** 所属资源ID */
    public Long resourceId;

    /** 版本保存时的资源标题 */
    public String title;

    /** 版本摘要快照 */
    public String summaryJson;

    /** 版本序号 */
    public Integer versionNumber;

    /** 创建时间 */
    public LocalDateTime createdAt;

    /**
     * 从实体转换为 DTO（列表用，不含内容）
     */
    public static ResourceVersionDTO fromEntity(ResourceVersion entity) {
        ResourceVersionDTO dto = new ResourceVersionDTO();
        dto.id = entity.id;
        dto.resourceId = entity.resourceId;
        dto.title = entity.title;
        dto.summaryJson = entity.summaryJson;
        dto.versionNumber = entity.versionNumber;
        dto.createdAt = entity.createdAt;
        return dto;
    }
}
