package org.wxs.bibledictionary.console.common.auth;

import jakarta.inject.Inject;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;
import org.wxs.bibledictionary.console.admin.entity.AdminUser;
import org.wxs.bibledictionary.console.common.response.Result;

import java.time.LocalDateTime;

/**
 * 管理员认证过滤器
 * 拦截 /private/ 路径的请求，验证管理员 Token
 * 注意：不使用 @PreMatching（会导致 AdminContext 为空）
 */
@Provider
public class AdminAuthFilter implements ContainerRequestFilter {

    @Inject
    AdminContext adminContext;

    /**
     * 过滤请求，验证管理员身份
     * @param requestContext 请求上下文
     */
    @Override
    public void filter(ContainerRequestContext requestContext) {
        String path = requestContext.getUriInfo().getPath();

        // 只拦截私有接口
        if (!path.startsWith("/private/")) {
            return;
        }

        // 从 Header 中获取 Token
        String authHeader = requestContext.getHeaderString("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            requestContext.abortWith(
                    Response.status(Response.Status.UNAUTHORIZED)
                            .entity(Result.fail(401, "未登录或Token已过期"))
                            .build()
            );
            return;
        }

        // 提取 Token 并验证
        String token = authHeader.substring(7);
        AdminUser admin = AdminUser.find("token = ?1 AND tokenExpiresAt > ?2", token, LocalDateTime.now())
                .firstResult();

        if (admin == null) {
            requestContext.abortWith(
                    Response.status(Response.Status.UNAUTHORIZED)
                            .entity(Result.fail(401, "未登录或Token已过期"))
                            .build()
            );
            return;
        }

        // 设置当前管理员上下文
        adminContext.setAdminId(admin.id);
    }
}
