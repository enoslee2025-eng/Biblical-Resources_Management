package org.wxs.bibledictionary.console.user.service;

import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import org.wxs.bibledictionary.console.resource.entity.Resource;
import org.wxs.bibledictionary.console.user.dto.UserDTO;
import org.wxs.bibledictionary.console.user.entity.User;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 用户管理服务
 * 提供后台管理端的用户查询功能
 */
@ApplicationScoped
public class UserManageService {

    /**
     * 获取所有用户列表
     * 按创建时间倒序排列，并统计每个用户的资源数量
     * @return 用户列表（包含资源数量统计）
     */
    public List<UserDTO> listAll() {
        // 查询所有用户，按创建时间倒序
        List<User> users = User.listAll(Sort.by("createdAt").descending());

        // 转换为 DTO 并查询每个用户的资源数量
        return users.stream().map(user -> {
            UserDTO dto = UserDTO.fromEntity(user);
            // 统计该用户创建的资源数量
            dto.resourceCount = Resource.count("userId", user.id);
            return dto;
        }).collect(Collectors.toList());
    }
}
