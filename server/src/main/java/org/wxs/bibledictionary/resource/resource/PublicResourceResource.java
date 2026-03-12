package org.wxs.bibledictionary.resource.resource;

import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.wxs.bibledictionary.resource.service.ResourceService;

/**
 * 公开资源接口
 * 提供无需认证的资源下载功能，供 APP 扫码下载公开资源使用
 */
@Path("/public/api/resource")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class PublicResourceResource {

    @Inject
    ResourceService resourceService;

    /**
     * 下载公开资源为 JSON 文件
     * 无需认证，仅允许下载已设为公开的资源
     * @param id 资源ID
     * @return 资源 JSON 文件（包含 type、meta、books）
     */
    @GET
    @Path("/download/{id}")
    @Produces(MediaType.APPLICATION_OCTET_STREAM)
    public Response download(@PathParam("id") Long id) {
        String json = resourceService.exportPublicResource(id);
        return Response.ok(json)
                .header("Content-Disposition", "attachment; filename=\"resource-" + id + ".json\"")
                .header("Content-Type", "application/json; charset=UTF-8")
                .build();
    }
}
