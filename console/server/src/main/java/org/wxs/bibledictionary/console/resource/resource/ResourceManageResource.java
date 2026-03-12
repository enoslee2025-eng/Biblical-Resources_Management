package org.wxs.bibledictionary.console.resource.resource;

import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import org.wxs.bibledictionary.console.common.response.Result;
import org.wxs.bibledictionary.console.resource.dto.ResourceDTO;
import org.wxs.bibledictionary.console.resource.service.ResourceManageService;

import java.util.List;

/**
 * 资源管理接口
 * 提供后台管理端的资源查询和删除功能
 * 需要管理员登录后才能访问
 */
@Path("/private/api/admin/resource")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class ResourceManageResource {

    @Inject
    ResourceManageService resourceManageService;

    /**
     * 获取所有资源列表
     * 支持按资源类型筛选
     * @param type 资源类型（可选）：bible、commentary、dictionary
     * @return 资源列表
     */
    @GET
    @Path("/list")
    public Result<List<ResourceDTO>> list(@QueryParam("type") String type) {
        return Result.ok(resourceManageService.listAll(type));
    }

    /**
     * 删除资源（管理员权限）
     * @param id 要删除的资源ID
     * @return 删除结果
     */
    @DELETE
    @Path("/delete/{id}")
    public Result<Void> delete(@PathParam("id") Long id) {
        resourceManageService.deleteResource(id);
        return Result.ok();
    }
}
