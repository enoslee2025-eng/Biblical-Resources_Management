package org.wxs.bibledictionary.console.user.resource;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.wxs.bibledictionary.console.common.response.Result;
import org.wxs.bibledictionary.console.user.dto.UserDTO;
import org.wxs.bibledictionary.console.user.service.UserManageService;

import java.util.List;

/**
 * 用户管理接口
 * 提供后台管理端的用户查询功能
 * 需要管理员登录后才能访问
 */
@Path("/private/api/admin/user")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class UserManageResource {

    @Inject
    UserManageService userManageService;

    /**
     * 获取所有用户列表
     * @return 用户列表（包含每个用户的资源数量）
     */
    @GET
    @Path("/list")
    public Result<List<UserDTO>> list() {
        return Result.ok(userManageService.listAll());
    }
}
