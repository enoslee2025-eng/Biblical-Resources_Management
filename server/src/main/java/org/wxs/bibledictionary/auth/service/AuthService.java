package org.wxs.bibledictionary.auth.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.wxs.bibledictionary.auth.dto.QrConfirmRequest;
import org.wxs.bibledictionary.auth.dto.QrCreateResponse;
import org.wxs.bibledictionary.auth.dto.QrStatusResponse;
import org.wxs.bibledictionary.auth.entity.QrLoginSession;
import org.wxs.bibledictionary.auth.entity.User;
import org.wxs.bibledictionary.common.auth.TokenService;
import org.wxs.bibledictionary.common.exception.BusinessException;

import java.time.LocalDateTime;
import java.util.Random;
import java.util.UUID;

/**
 * 认证服务
 * 处理二维码登录的完整流程
 */
@ApplicationScoped
public class AuthService {

    @Inject
    TokenService tokenService;

    /**
     * 创建二维码登录会话
     * 生成唯一的会话ID和6位验证码，二维码3分钟有效
     * @return 二维码会话信息
     */
    @Transactional
    public QrCreateResponse createQrSession() {
        QrLoginSession session = new QrLoginSession();
        session.id = UUID.randomUUID().toString();
        session.code = generateCode();
        session.status = 0;
        // 二维码3分钟过期
        session.expiresAt = LocalDateTime.now().plusMinutes(3);
        session.persist();

        return new QrCreateResponse(session.id, session.code, 0);
    }

    /**
     * 查询二维码状态（前端轮询调用）
     * @param sessionId 会话ID
     * @return 当前状态和Token（登录成功时）
     */
    public QrStatusResponse getQrStatus(String sessionId) {
        QrLoginSession session = QrLoginSession.findById(sessionId);
        if (session == null) {
            throw new BusinessException(404, "二维码会话不存在");
        }

        // 检查是否过期
        if (session.isExpired() && session.status < 2) {
            return new QrStatusResponse(3, null);
        }

        // 状态为已登录时返回Token
        if (session.status == 2) {
            return new QrStatusResponse(2, session.token);
        }

        return new QrStatusResponse(session.status, null);
    }

    /**
     * APP 确认扫码登录
     * 验证会话和验证码后，生成Token并绑定用户
     * @param request 确认请求（包含会话ID、验证码、APP用户UID）
     */
    @Transactional
    public void confirmQrLogin(QrConfirmRequest request) {
        // 参数校验
        if (request.id == null || request.code == null || request.uid == null) {
            throw new BusinessException(400, "参数不完整");
        }

        // 查找会话
        QrLoginSession session = QrLoginSession.findById(request.id);
        if (session == null) {
            throw new BusinessException(404, "二维码会话不存在");
        }

        // 检查是否过期
        if (session.isExpired()) {
            throw new BusinessException(400, "二维码已过期，请刷新重试");
        }

        // 验证码校验
        if (!session.code.equals(request.code)) {
            throw new BusinessException(400, "验证码错误");
        }

        // 检查状态（只有未扫码或已扫码状态才能确认）
        if (session.status >= 2) {
            throw new BusinessException(400, "该二维码已被使用");
        }

        // 生成Token
        String newToken = tokenService.generateToken();
        LocalDateTime expiresAt = tokenService.getTokenExpireTime();

        // 创建或更新用户
        User user = User.findById(request.uid);
        if (user == null) {
            // 首次登录，创建用户记录
            user = new User();
            user.id = request.uid;
            user.token = newToken;
            user.tokenExpiresAt = expiresAt;
            user.persist();
        } else {
            // 更新Token
            user.token = newToken;
            user.tokenExpiresAt = expiresAt;
        }

        // 更新会话状态为已登录
        session.uid = request.uid;
        session.token = newToken;
        session.status = 2;
    }

    /**
     * 退出登录
     * 清除用户的Token
     * @param userId 用户ID
     */
    @Transactional
    public void logout(Long userId) {
        User user = User.findById(userId);
        if (user != null) {
            // 使缓存失效
            tokenService.invalidateToken(user.token);
            // 清除数据库中的Token
            user.token = null;
            user.tokenExpiresAt = null;
        }
    }

    /**
     * 开发环境快速登录
     * 自动创建/更新 UID=1 的开发用户，生成有效 Token 返回
     * @return 登录 Token
     */
    @Transactional
    public String devLogin() {
        Long devUserId = 1L;
        String token = tokenService.generateToken();
        LocalDateTime expiresAt = tokenService.getTokenExpireTime();

        User user = User.findById(devUserId);
        if (user == null) {
            user = new User();
            user.id = devUserId;
            user.token = token;
            user.tokenExpiresAt = expiresAt;
            user.persist();
        } else {
            user.token = token;
            user.tokenExpiresAt = expiresAt;
        }

        return token;
    }

    /**
     * 生成6位数字验证码
     */
    private String generateCode() {
        Random random = new Random();
        int code = 100000 + random.nextInt(900000);
        return String.valueOf(code);
    }
}
