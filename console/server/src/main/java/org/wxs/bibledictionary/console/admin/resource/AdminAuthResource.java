package org.wxs.bibledictionary.console.admin.resource;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.wxs.bibledictionary.console.admin.dto.AdminLoginRequest;
import org.wxs.bibledictionary.console.admin.dto.AdminUserDTO;
import org.wxs.bibledictionary.console.admin.entity.AdminUser;
import org.wxs.bibledictionary.console.admin.service.AdminAuthService;
import org.wxs.bibledictionary.console.common.auth.AdminContext;
import org.wxs.bibledictionary.console.common.response.Result;

import java.util.HashMap;
import java.util.Map;

/**
 * 管理员认证接口
 * 处理管理员登录和登出
 */
@Path("/")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class AdminAuthResource {

    @Inject
    AdminAuthService adminAuthService;

    @Inject
    AdminContext adminContext;

    /**
     * 管理员登录
     * 公开接口，无需认证
     * @param request 登录请求（包含用户名和密码）
     * @return 登录成功返回 Token 和管理员信息
     */
    @POST
    @Path("/public/api/admin/auth/login")
    public Result<Map<String, Object>> login(AdminLoginRequest request) {
        AdminUser admin = adminAuthService.login(request.username, request.password);

        // 组装返回数据：Token + 管理员信息
        Map<String, Object> data = new HashMap<>();
        data.put("token", admin.token);
        data.put("admin", AdminUserDTO.fromEntity(admin));

        return Result.ok(data);
    }

    /**
     * 管理员登出
     * 私有接口，需要认证
     * @return 登出结果
     */
    @POST
    @Path("/private/api/admin/auth/logout")
    public Result<Void> logout() {
        adminAuthService.logout(adminContext.getAdminId());
        return Result.ok();
    }
}
