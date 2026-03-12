package org.wxs.bibledictionary.resource.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.wxs.bibledictionary.common.exception.BusinessException;
import org.wxs.bibledictionary.resource.dto.*;
import org.wxs.bibledictionary.resource.entity.Resource;
import org.wxs.bibledictionary.resource.entity.ResourceVersion;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 资源服务
 * 处理圣经译本、注释、词典等资源的增删改查
 */
@ApplicationScoped
public class ResourceService {

    /**
     * 创建资源
     * @param userId 当前用户ID
     * @param request 创建请求
     * @return 创建后的资源信息
     */
    @Transactional
    public ResourceDTO create(Long userId, CreateResourceRequest request) {
        // 参数校验
        if (request.type == null || request.title == null || request.title.isBlank()) {
            throw new BusinessException(400, "资源类型和标题不能为空");
        }

        // 验证资源类型
        if (!"bible".equals(request.type) && !"commentary".equals(request.type)
                && !"dictionary".equals(request.type) && !"material".equals(request.type)) {
            throw new BusinessException(400, "不支持的资源类型");
        }

        Resource resource = new Resource();
        resource.userId = userId;
        resource.type = request.type;
        resource.title = request.title;
        resource.metaJson = request.metaJson;
        resource.persist();

        return ResourceDTO.fromEntity(resource);
    }

    /**
     * 获取当前用户的资源列表
     * @param userId 用户ID
     * @param type 资源类型（可选，为空则查全部）
     * @return 资源列表
     */
    public List<ResourceDTO> listByUser(Long userId, String type) {
        List<Resource> resources;
        if (type != null && !type.isBlank()) {
            resources = Resource.list("userId = ?1 AND type = ?2 ORDER BY updatedAt DESC", userId, type);
        } else {
            resources = Resource.list("userId = ?1 ORDER BY updatedAt DESC", userId);
        }
        return resources.stream().map(ResourceDTO::fromEntity).toList();
    }

    /**
     * 获取资源详情（含完整内容）
     * @param userId 当前用户ID
     * @param resourceId 资源ID
     * @return 资源详情
     */
    public ResourceDetailDTO getDetail(Long userId, Long resourceId) {
        Resource resource = Resource.findById(resourceId);
        if (resource == null) {
            throw new BusinessException(404, "资源不存在");
        }

        // 权限检查：只能查看自己的资源或公开资源
        if (!resource.userId.equals(userId) && resource.isPublic != 1) {
            throw new BusinessException(403, "无权访问此资源");
        }

        return ResourceDetailDTO.fromEntity(resource);
    }

    /**
     * 更新资源
     * @param userId 当前用户ID
     * @param resourceId 资源ID
     * @param request 更新请求
     * @return 更新后的资源信息
     */
    @Transactional
    public ResourceDTO update(Long userId, Long resourceId, UpdateResourceRequest request) {
        Resource resource = Resource.findById(resourceId);
        if (resource == null) {
            throw new BusinessException(404, "资源不存在");
        }

        // 权限检查：只能修改自己的资源
        if (!resource.userId.equals(userId)) {
            throw new BusinessException(403, "无权修改此资源");
        }

        // 内容有变更时，先创建版本快照（保存旧版本）
        if (request.contentJson != null && resource.contentJson != null) {
            createVersionSnapshot(resource);
        }

        // 更新字段（仅更新非空字段）
        if (request.title != null && !request.title.isBlank()) {
            resource.title = request.title;
        }
        if (request.metaJson != null) {
            resource.metaJson = request.metaJson;
        }
        if (request.contentJson != null) {
            resource.contentJson = request.contentJson;
            // 内容更新时自动计算摘要缓存
            resource.summaryJson = computeSummaryJson(resource.type, resource.contentJson);
        }
        if (request.isPublic != null) {
            resource.isPublic = request.isPublic;
        }

        return ResourceDTO.fromEntity(resource);
    }

    /**
     * 删除资源
     * @param userId 当前用户ID
     * @param resourceId 资源ID
     */
    @Transactional
    public void delete(Long userId, Long resourceId) {
        Resource resource = Resource.findById(resourceId);
        if (resource == null) {
            throw new BusinessException(404, "资源不存在");
        }

        // 权限检查
        if (!resource.userId.equals(userId)) {
            throw new BusinessException(403, "无权删除此资源");
        }

        resource.delete();
    }

    /**
     * 复制资源
     * 创建一份完全相同的资源副本，标题后加"（副本）"
     * @param userId 当前用户ID
     * @param resourceId 要复制的资源ID
     * @return 新创建的资源信息
     */
    @Transactional
    public ResourceDTO copy(Long userId, Long resourceId) {
        Resource source = Resource.findById(resourceId);
        if (source == null) {
            throw new BusinessException(404, "资源不存在");
        }

        // 权限检查：只能复制自己的资源或公开资源
        if (!source.userId.equals(userId) && source.isPublic != 1) {
            throw new BusinessException(403, "无权复制此资源");
        }

        Resource copy = new Resource();
        copy.userId = userId;
        copy.type = source.type;
        copy.title = source.title + "（副本）";
        copy.metaJson = source.metaJson;
        copy.contentJson = source.contentJson;
        copy.persist();

        return ResourceDTO.fromEntity(copy);
    }

    /**
     * 获取资源内容摘要统计
     * 用于在列表中显示编辑进度和导出预览
     * @param userId 当前用户ID
     * @param resourceId 资源ID
     * @return 统计信息 Map
     */
    public Map<String, Object> getResourceSummary(Long userId, Long resourceId) {
        Resource resource = Resource.findById(resourceId);
        if (resource == null) {
            throw new BusinessException(404, "资源不存在");
        }
        if (!resource.userId.equals(userId) && resource.isPublic != 1) {
            throw new BusinessException(403, "无权访问此资源");
        }

        Map<String, Object> summary = new HashMap<>();
        summary.put("type", resource.type);
        summary.put("title", resource.title);

        if ("bible".equals(resource.type) && resource.contentJson != null && !resource.contentJson.isBlank()) {
            // 统计圣经内容：已编辑卷数、总章数、总节数
            try {
                com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                com.fasterxml.jackson.databind.JsonNode books = mapper.readTree(resource.contentJson);
                int totalBooks = books.size();
                int filledBooks = 0;
                int totalChapters = 0;
                int filledChapters = 0;
                int totalVerses = 0;

                for (com.fasterxml.jackson.databind.JsonNode book : books) {
                    com.fasterxml.jackson.databind.JsonNode chapters = book.get("chapters");
                    if (chapters == null) continue;
                    boolean bookHasContent = false;
                    totalChapters += chapters.size();
                    for (com.fasterxml.jackson.databind.JsonNode chapter : chapters) {
                        com.fasterxml.jackson.databind.JsonNode verses = chapter.get("verses");
                        if (verses != null && verses.size() > 0) {
                            filledChapters++;
                            totalVerses += verses.size();
                            bookHasContent = true;
                        }
                    }
                    if (bookHasContent) filledBooks++;
                }

                summary.put("totalBooks", totalBooks);
                summary.put("filledBooks", filledBooks);
                summary.put("totalChapters", totalChapters);
                summary.put("filledChapters", filledChapters);
                summary.put("totalVerses", totalVerses);
            } catch (Exception e) {
                // JSON 解析失败，返回空统计
                summary.put("totalBooks", 0);
                summary.put("filledBooks", 0);
            }
        }

        return summary;
    }

    /**
     * 获取用户资源统计信息
     * 包含各类型资源数量和最近编辑的资源列表
     * @param userId 当前用户ID
     * @return 统计信息 Map（counts: 各类型数量, recentEdits: 最近编辑列表, total: 总数）
     */
    public Map<String, Object> getStats(Long userId) {
        List<Resource> allResources = Resource.list("userId = ?1 ORDER BY updatedAt DESC", userId);

        // 按类型统计数量
        Map<String, Long> counts = new HashMap<>();
        counts.put("bible", 0L);
        counts.put("dictionary", 0L);
        counts.put("commentary", 0L);
        counts.put("material", 0L);
        for (Resource r : allResources) {
            counts.merge(r.type, 1L, Long::sum);
        }

        // 最近编辑的 10 个资源（不含内容）
        List<ResourceDTO> recentEdits = allResources.stream()
                .limit(10)
                .map(ResourceDTO::fromEntity)
                .toList();

        Map<String, Object> stats = new HashMap<>();
        stats.put("counts", counts);
        stats.put("recentEdits", recentEdits);
        stats.put("total", (long) allResources.size());
        return stats;
    }

    /**
     * 导出资源为标准 JSON 格式
     * 拼接 type + meta + content 为完整的导出结构
     * @param userId 当前用户ID
     * @param resourceId 资源ID
     * @return 标准格式的 JSON 字符串
     */
    public String exportResource(Long userId, Long resourceId) {
        Resource resource = Resource.findById(resourceId);
        if (resource == null) {
            throw new BusinessException(404, "资源不存在");
        }

        // 权限检查
        if (!resource.userId.equals(userId) && resource.isPublic != 1) {
            throw new BusinessException(403, "无权导出此资源");
        }

        // 拼接标准导出结构
        StringBuilder sb = new StringBuilder();
        sb.append("{");
        sb.append("\"type\":\"").append(resource.type).append("\",");
        sb.append("\"meta\":").append(resource.metaJson != null ? resource.metaJson : "{}").append(",");
        sb.append("\"books\":").append(resource.contentJson != null ? resource.contentJson : "[]");
        sb.append("}");

        return sb.toString();
    }

    /**
     * 导出公开资源为标准 JSON 格式
     * 无需用户身份验证，仅允许导出已设为公开的资源
     * 供 APP 扫码下载使用
     * @param resourceId 资源ID
     * @return 标准格式的 JSON 字符串
     */
    public String exportPublicResource(Long resourceId) {
        Resource resource = Resource.findById(resourceId);
        if (resource == null) {
            throw new BusinessException(404, "资源不存在");
        }

        // 权限检查：仅允许下载公开资源
        if (resource.isPublic != 1) {
            throw new BusinessException(403, "该资源未公开，无法下载");
        }

        // 拼接标准导出结构
        StringBuilder sb = new StringBuilder();
        sb.append("{");
        sb.append("\"type\":\"").append(resource.type).append("\",");
        sb.append("\"meta\":").append(resource.metaJson != null ? resource.metaJson : "{}").append(",");
        sb.append("\"books\":").append(resource.contentJson != null ? resource.contentJson : "[]");
        sb.append("}");

        return sb.toString();
    }

    /**
     * 创建版本快照
     * 保存当前资源状态为一个历史版本，最多保留 50 个版本
     * @param resource 当前资源（保存前的状态）
     */
    private void createVersionSnapshot(Resource resource) {
        // 查询当前最大版本号
        Long maxVersion = ResourceVersion.count("resourceId = ?1", resource.id);
        int nextVersion = maxVersion.intValue() + 1;

        // 创建版本快照
        ResourceVersion version = new ResourceVersion();
        version.resourceId = resource.id;
        version.userId = resource.userId;
        version.title = resource.title;
        version.metaJson = resource.metaJson;
        version.contentJson = resource.contentJson;
        version.summaryJson = resource.summaryJson;
        version.versionNumber = nextVersion;
        version.persist();

        // 超过 50 个版本时，删除最早的版本
        long totalVersions = ResourceVersion.count("resourceId = ?1", resource.id);
        if (totalVersions > 50) {
            long deleteCount = totalVersions - 50;
            List<ResourceVersion> oldVersions = ResourceVersion.list(
                "resourceId = ?1 ORDER BY versionNumber ASC", resource.id
            );
            for (int i = 0; i < deleteCount && i < oldVersions.size(); i++) {
                oldVersions.get(i).delete();
            }
        }
    }

    /**
     * 获取资源的版本历史列表
     * @param userId 当前用户ID
     * @param resourceId 资源ID
     * @return 版本列表（不含内容，按版本号倒序）
     */
    public List<ResourceVersionDTO> listVersions(Long userId, Long resourceId) {
        Resource resource = Resource.findById(resourceId);
        if (resource == null) {
            throw new BusinessException(404, "资源不存在");
        }
        if (!resource.userId.equals(userId)) {
            throw new BusinessException(403, "无权访问此资源");
        }

        List<ResourceVersion> versions = ResourceVersion.list(
            "resourceId = ?1 ORDER BY versionNumber DESC", resourceId
        );
        return versions.stream().map(ResourceVersionDTO::fromEntity).toList();
    }

    /**
     * 获取版本详情（含完整内容）
     * @param userId 当前用户ID
     * @param versionId 版本ID
     * @return 版本详情 Map（含 contentJson）
     */
    public Map<String, Object> getVersionDetail(Long userId, Long versionId) {
        ResourceVersion version = ResourceVersion.findById(versionId);
        if (version == null) {
            throw new BusinessException(404, "版本不存在");
        }

        Resource resource = Resource.findById(version.resourceId);
        if (resource == null || !resource.userId.equals(userId)) {
            throw new BusinessException(403, "无权访问此版本");
        }

        Map<String, Object> detail = new HashMap<>();
        detail.put("id", version.id);
        detail.put("resourceId", version.resourceId);
        detail.put("title", version.title);
        detail.put("metaJson", version.metaJson);
        detail.put("contentJson", version.contentJson);
        detail.put("summaryJson", version.summaryJson);
        detail.put("versionNumber", version.versionNumber);
        detail.put("createdAt", version.createdAt);
        return detail;
    }

    /**
     * 恢复到指定版本
     * 将指定版本的内容覆盖到当前资源，同时创建当前状态的快照
     * @param userId 当前用户ID
     * @param resourceId 资源ID
     * @param versionId 要恢复的版本ID
     * @return 恢复后的资源信息
     */
    @Transactional
    public ResourceDTO restoreVersion(Long userId, Long resourceId, Long versionId) {
        Resource resource = Resource.findById(resourceId);
        if (resource == null) {
            throw new BusinessException(404, "资源不存在");
        }
        if (!resource.userId.equals(userId)) {
            throw new BusinessException(403, "无权修改此资源");
        }

        ResourceVersion version = ResourceVersion.findById(versionId);
        if (version == null || !version.resourceId.equals(resourceId)) {
            throw new BusinessException(404, "版本不存在");
        }

        // 先保存当前状态为快照
        if (resource.contentJson != null) {
            createVersionSnapshot(resource);
        }

        // 恢复版本内容
        resource.title = version.title;
        resource.metaJson = version.metaJson;
        resource.contentJson = version.contentJson;
        resource.summaryJson = version.summaryJson;

        return ResourceDTO.fromEntity(resource);
    }

    /**
     * 计算资源内容摘要 JSON
     * 根据资源类型解析 contentJson，生成轻量级摘要用于列表展示
     * @param type 资源类型
     * @param contentJson 资源内容 JSON 字符串
     * @return 摘要 JSON 字符串
     */
    private String computeSummaryJson(String type, String contentJson) {
        if (contentJson == null || contentJson.isBlank()) {
            return null;
        }

        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();

            if ("bible".equals(type)) {
                // 圣经：统计书卷数、章数、节数
                com.fasterxml.jackson.databind.JsonNode books = mapper.readTree(contentJson);
                int totalBooks = books.size();
                int filledBooks = 0;
                int totalChapters = 0;
                int filledChapters = 0;
                int totalVerses = 0;

                for (com.fasterxml.jackson.databind.JsonNode book : books) {
                    com.fasterxml.jackson.databind.JsonNode chapters = book.get("chapters");
                    if (chapters == null) continue;
                    boolean bookHasContent = false;
                    totalChapters += chapters.size();
                    for (com.fasterxml.jackson.databind.JsonNode chapter : chapters) {
                        com.fasterxml.jackson.databind.JsonNode verses = chapter.get("verses");
                        if (verses != null && verses.size() > 0) {
                            filledChapters++;
                            totalVerses += verses.size();
                            bookHasContent = true;
                        }
                    }
                    if (bookHasContent) filledBooks++;
                }

                return String.format(
                    "{\"filledBooks\":%d,\"totalBooks\":%d,\"filledChapters\":%d,\"totalChapters\":%d,\"totalVerses\":%d}",
                    filledBooks, totalBooks, filledChapters, totalChapters, totalVerses
                );
            } else {
                // 词典/注释/素材：统计条目数
                com.fasterxml.jackson.databind.JsonNode entries = mapper.readTree(contentJson);
                int entryCount = entries.isArray() ? entries.size() : 0;
                return String.format("{\"entryCount\":%d}", entryCount);
            }
        } catch (Exception e) {
            // 解析失败返回 null
            return null;
        }
    }
}
