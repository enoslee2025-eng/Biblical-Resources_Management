package org.wxs.bibledictionary.resource.resource;

import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.wxs.bibledictionary.common.auth.UserContext;
import org.wxs.bibledictionary.common.response.Result;
import org.wxs.bibledictionary.resource.dto.*;
import org.wxs.bibledictionary.resource.service.ResourceService;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;

/**
 * 资源接口
 * 提供圣经译本等资源的增删改查和导出功能
 */
@Path("/private/api/resource")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ResourceResource {

    @Inject
    ResourceService resourceService;

    @Inject
    UserContext userContext;

    @Inject
    ObjectMapper objectMapper;

    /**
     * 创建资源
     */
    @POST
    @Path("/create")
    public Result<ResourceDTO> create(CreateResourceRequest request) {
        ResourceDTO dto = resourceService.create(userContext.getUserId(), request);
        return Result.ok(dto);
    }

    /**
     * 获取资源列表
     * @param type 资源类型（可选）
     */
    @GET
    @Path("/list")
    public Result<List<ResourceDTO>> list(@QueryParam("type") String type) {
        List<ResourceDTO> list = resourceService.listByUser(userContext.getUserId(), type);
        return Result.ok(list);
    }

    /**
     * 获取资源详情（含完整内容）
     * @param id 资源ID
     */
    @GET
    @Path("/detail/{id}")
    public Result<ResourceDetailDTO> detail(@PathParam("id") Long id) {
        ResourceDetailDTO dto = resourceService.getDetail(userContext.getUserId(), id);
        return Result.ok(dto);
    }

    /**
     * 更新资源
     * @param id 资源ID
     */
    @PUT
    @Path("/update/{id}")
    public Result<ResourceDTO> update(@PathParam("id") Long id, UpdateResourceRequest request) {
        ResourceDTO dto = resourceService.update(userContext.getUserId(), id, request);
        return Result.ok(dto);
    }

    /**
     * 删除资源
     * @param id 资源ID
     */
    @DELETE
    @Path("/delete/{id}")
    public Result<Void> delete(@PathParam("id") Long id) {
        resourceService.delete(userContext.getUserId(), id);
        return Result.ok();
    }

    /**
     * 复制资源
     * @param id 要复制的资源ID
     */
    @POST
    @Path("/copy/{id}")
    public Result<ResourceDTO> copy(@PathParam("id") Long id) {
        ResourceDTO dto = resourceService.copy(userContext.getUserId(), id);
        return Result.ok(dto);
    }

    /**
     * 获取用户资源统计（首页数据中心用）
     * 返回各类型资源数量和最近编辑的资源列表
     */
    @GET
    @Path("/stats")
    public Result<Map<String, Object>> stats() {
        Map<String, Object> stats = resourceService.getStats(userContext.getUserId());
        return Result.ok(stats);
    }

    /**
     * 获取资源内容摘要统计（编辑进度、导出预览用）
     * @param id 资源ID
     */
    @GET
    @Path("/summary/{id}")
    public Result<Map<String, Object>> summary(@PathParam("id") Long id) {
        Map<String, Object> summary = resourceService.getResourceSummary(userContext.getUserId(), id);
        return Result.ok(summary);
    }

    /**
     * 获取资源版本历史列表
     * @param id 资源ID
     */
    @GET
    @Path("/versions/{id}")
    public Result<List<ResourceVersionDTO>> versions(@PathParam("id") Long id) {
        List<ResourceVersionDTO> versions = resourceService.listVersions(userContext.getUserId(), id);
        return Result.ok(versions);
    }

    /**
     * 获取版本详情（含完整内容）
     * @param versionId 版本ID
     */
    @GET
    @Path("/version-detail/{versionId}")
    public Result<Map<String, Object>> versionDetail(@PathParam("versionId") Long versionId) {
        Map<String, Object> detail = resourceService.getVersionDetail(userContext.getUserId(), versionId);
        return Result.ok(detail);
    }

    /**
     * 恢复到指定版本
     * @param id 资源ID
     * @param versionId 要恢复的版本ID
     */
    @POST
    @Path("/restore/{id}/{versionId}")
    public Result<ResourceDTO> restoreVersion(@PathParam("id") Long id, @PathParam("versionId") Long versionId) {
        ResourceDTO dto = resourceService.restoreVersion(userContext.getUserId(), id, versionId);
        return Result.ok(dto);
    }

    /**
     * 删除单个版本
     * @param versionId 版本ID
     */
    @DELETE
    @Path("/version/{versionId}")
    public Result<Void> deleteVersion(@PathParam("versionId") Long versionId) {
        resourceService.deleteVersion(userContext.getUserId(), versionId);
        return Result.ok();
    }

    /**
     * 清空资源的所有版本历史
     * @param id 资源ID
     */
    @DELETE
    @Path("/versions/{id}")
    public Result<Void> clearVersions(@PathParam("id") Long id) {
        resourceService.clearVersions(userContext.getUserId(), id);
        return Result.ok();
    }

    /**
     * 导入内容（前端本地解析后上传）
     * 接收解析好的文字内容，创建一条新资源记录
     */
    @POST
    @Path("/import-content")
    public Result<ResourceDTO> importContent(ImportContentRequest request) {
        // 1. 创建资源记录（标题 + 类型）
        CreateResourceRequest createReq = new CreateResourceRequest();
        createReq.type = request.type;
        createReq.title = request.title;
        ResourceDTO created = resourceService.create(userContext.getUserId(), createReq);

        // 2. 将内容存入 contentJson
        UpdateResourceRequest updateReq = new UpdateResourceRequest();
        updateReq.title = request.title;
        if (request.contentJson != null && !request.contentJson.isBlank()) {
            // 前端已解析好结构化数据（如圣经译本的章节经文），直接使用
            updateReq.contentJson = request.contentJson;
        } else {
            // 纯文字内容，包装为简单 JSON
            try {
                updateReq.contentJson = objectMapper.writeValueAsString(
                    java.util.Map.of("text", request.content != null ? request.content : "",
                                     "format", request.format != null ? request.format : "txt")
                );
            } catch (Exception e) {
                updateReq.contentJson = "{\"text\":\"\"}";
            }
        }
        ResourceDTO updated = resourceService.update(userContext.getUserId(), created.id, updateReq);

        return Result.ok(updated);
    }

    /**
     * 导出资源为 JSON 文件
     * @param id 资源ID
     */
    @GET
    @Path("/export/{id}")
    @Produces(MediaType.APPLICATION_OCTET_STREAM)
    public Response export(@PathParam("id") Long id) {
        String json = resourceService.exportResource(userContext.getUserId(), id);
        return Response.ok(json)
                .header("Content-Disposition", "attachment; filename=\"resource-" + id + ".json\"")
                .header("Content-Type", "application/json; charset=UTF-8")
                .build();
    }
}
