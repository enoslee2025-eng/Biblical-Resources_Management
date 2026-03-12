package org.wxs.bibledictionary.auth.resource;

import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import org.wxs.bibledictionary.auth.dto.QrConfirmRequest;
import org.wxs.bibledictionary.auth.dto.QrCreateResponse;
import org.wxs.bibledictionary.auth.dto.QrStatusResponse;
import org.wxs.bibledictionary.auth.service.AuthService;
import org.wxs.bibledictionary.common.auth.UserContext;
import org.wxs.bibledictionary.common.response.Result;

/**
 * 认证接口
 * 提供二维码登录和退出登录功能
 */
@Path("/")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class AuthResource {

    @Inject
    AuthService authService;

    @Inject
    UserContext userContext;

    /**
     * 生成二维码
     * 前端调用此接口获取二维码信息，用于生成二维码图片
     */
    @POST
    @Path("/public/api/auth/qr/create")
    public Result<QrCreateResponse> createQr() {
        QrCreateResponse response = authService.createQrSession();
        return Result.ok(response);
    }

    /**
     * 轮询二维码状态
     * 前端每3秒调用一次，检查是否已扫码登录
     * @param id 二维码会话ID
     */
    @GET
    @Path("/public/api/auth/qr/status")
    public Result<QrStatusResponse> getQrStatus(@QueryParam("id") String id) {
        QrStatusResponse response = authService.getQrStatus(id);
        return Result.ok(response);
    }

    /**
     * APP 确认扫码登录
     * 主内圣经 APP 扫码后调用此接口确认登录
     */
    @POST
    @Path("/public/api/auth/qr/confirm")
    public Result<Void> confirmQrLogin(QrConfirmRequest request) {
        authService.confirmQrLogin(request);
        return Result.ok();
    }

    /**
     * 开发环境快速登录
     * 自动以 UID=1 的开发账号登录，返回有效 Token
     * 仅供开发调试使用
     */
    @POST
    @Path("/public/api/auth/dev-login")
    public Result<String> devLogin() {
        String token = authService.devLogin();
        return Result.ok(token);
    }

    /**
     * 退出登录
     * 清除当前用户的 Token
     */
    @POST
    @Path("/private/api/auth/logout")
    public Result<Void> logout() {
        authService.logout(userContext.getUserId());
        return Result.ok();
    }
}
