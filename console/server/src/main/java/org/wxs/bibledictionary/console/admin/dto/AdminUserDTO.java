package org.wxs.bibledictionary.console.admin.dto;

import org.wxs.bibledictionary.console.admin.entity.AdminUser;

import java.time.LocalDateTime;

/**
 * 管理员用户数据传输对象
 * 不暴露密码、Token 等敏感字段
 */
public class AdminUserDTO {

    /** 管理员ID */
    public Long id;

    /** 用户名 */
    public String username;

    /** 昵称 */
    public String nickname;

    /** 状态：0-禁用，1-正常 */
    public Integer status;

    /** 创建时间 */
    public LocalDateTime createdAt;

    /**
     * 从实体转换为 DTO
     * @param entity 管理员实体
     * @return 管理员 DTO（不含敏感信息）
     */
    public static AdminUserDTO fromEntity(AdminUser entity) {
        AdminUserDTO dto = new AdminUserDTO();
        dto.id = entity.id;
        dto.username = entity.username;
        dto.nickname = entity.nickname;
        dto.status = entity.status;
        dto.createdAt = entity.createdAt;
        return dto;
    }
}
