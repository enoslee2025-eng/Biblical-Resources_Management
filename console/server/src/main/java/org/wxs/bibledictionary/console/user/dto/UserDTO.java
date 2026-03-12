package org.wxs.bibledictionary.console.user.dto;

import org.wxs.bibledictionary.console.user.entity.User;

import java.time.LocalDateTime;

/**
 * 用户数据传输对象
 * 用于后台管理端展示用户信息，包含资源统计数量
 */
public class UserDTO {

    /** 用户ID */
    public Long id;

    /** 创建时间 */
    public LocalDateTime createdAt;

    /** 更新时间 */
    public LocalDateTime updatedAt;

    /** 该用户创建的资源数量 */
    public Long resourceCount;

    /**
     * 从实体转换为 DTO
     * @param entity 用户实体
     * @return 用户 DTO
     */
    public static UserDTO fromEntity(User entity) {
        UserDTO dto = new UserDTO();
        dto.id = entity.id;
        dto.createdAt = entity.createdAt;
        dto.updatedAt = entity.updatedAt;
        dto.resourceCount = 0L;
        return dto;
    }
}
