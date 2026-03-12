package org.wxs.bibledictionary.common.auth;

import jakarta.inject.Inject;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;
import org.wxs.bibledictionary.common.response.Result;

/**
 * 认证过滤器
 * 拦截 /private/api/* 路径的请求，验证 Token
 * 注意：不使用 @PreMatching（会导致 UserContext 为空）
 */
@Provider
public class AuthFilter implements ContainerRequestFilter {

    @Inject
    TokenService tokenService;

    @Inject
    UserContext userContext;

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

        String token = authHeader.substring(7);
        Long userId = tokenService.validateToken(token);
        if (userId == null) {
            requestContext.abortWith(
                    Response.status(Response.Status.UNAUTHORIZED)
                            .entity(Result.fail(401, "未登录或Token已过期"))
                            .build()
            );
            return;
        }

        // 设置当前用户上下文
        userContext.setUserId(userId);
    }
}
