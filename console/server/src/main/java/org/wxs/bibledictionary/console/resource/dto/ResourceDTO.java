package org.wxs.bibledictionary.console.resource.dto;

import org.wxs.bibledictionary.console.resource.entity.Resource;

import java.time.LocalDateTime;

/**
 * 资源数据传输对象
 * 不包含 contentJson 字段（内容过大，不适合列表展示）
 */
public class ResourceDTO {

    /** 资源ID */
    public Long id;

    /** 创建者用户ID */
    public Long userId;

    /** 资源类型：bible-圣经译本，commentary-注释，dictionary-词典 */
    public String type;

    /** 资源标题 */
    public String title;

    /** 是否公开：0-私有，1-公开 */
    public Integer isPublic;

    /** 版本号 */
    public Integer version;

    /** 创建时间 */
    public LocalDateTime createdAt;

    /** 更新时间 */
    public LocalDateTime updatedAt;

    /**
     * 从实体转换为 DTO
     * 不包含 contentJson（内容可能非常大，列表中不需要）
     * @param entity 资源实体
     * @return 资源 DTO
     */
    public static ResourceDTO fromEntity(Resource entity) {
        ResourceDTO dto = new ResourceDTO();
        dto.id = entity.id;
        dto.userId = entity.userId;
        dto.type = entity.type;
        dto.title = entity.title;
        dto.isPublic = entity.isPublic;
        dto.version = entity.version;
        dto.createdAt = entity.createdAt;
        dto.updatedAt = entity.updatedAt;
        return dto;
    }
}
