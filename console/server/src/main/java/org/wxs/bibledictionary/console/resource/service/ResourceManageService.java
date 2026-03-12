package org.wxs.bibledictionary.console.resource.service;

import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.wxs.bibledictionary.console.common.exception.BusinessException;
import org.wxs.bibledictionary.console.resource.dto.ResourceDTO;
import org.wxs.bibledictionary.console.resource.entity.Resource;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 资源管理服务
 * 提供后台管理端的资源查询和删除功能
 */
@ApplicationScoped
public class ResourceManageService {

    /**
     * 获取所有资源列表
     * 可按资源类型筛选，按更新时间倒序排列
     * @param type 资源类型（可选）：bible-圣经译本，commentary-注释，dictionary-词典
     * @return 资源列表（不含 contentJson 大字段）
     */
    public List<ResourceDTO> listAll(String type) {
        List<Resource> resources;

        if (type != null && !type.isEmpty()) {
            // 按类型筛选
            resources = Resource.list("type = ?1 ORDER BY updatedAt DESC", type);
        } else {
            // 查询全部，按更新时间倒序
            resources = Resource.listAll(Sort.by("updatedAt").descending());
        }

        // 转换为 DTO（不包含 contentJson）
        return resources.stream()
                .map(ResourceDTO::fromEntity)
                .collect(Collectors.toList());
    }

    /**
     * 删除资源（管理员权限）
     * 管理员可以删除任意用户的资源
     * @param id 资源ID
     * @throws BusinessException 资源不存在时抛出异常
     */
    @Transactional
    public void deleteResource(Long id) {
        Resource resource = Resource.findById(id);
        if (resource == null) {
            throw new BusinessException(404, "资源不存在");
        }
        resource.delete();
    }
}
