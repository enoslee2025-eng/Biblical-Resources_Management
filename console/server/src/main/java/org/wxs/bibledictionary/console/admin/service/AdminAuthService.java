package org.wxs.bibledictionary.console.admin.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.mindrot.jbcrypt.BCrypt;
import org.wxs.bibledictionary.console.admin.entity.AdminUser;
import org.wxs.bibledictionary.console.common.exception.BusinessException;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 管理员认证服务
 * 处理管理员登录、Token 验证、登出等业务逻辑
 */
@ApplicationScoped
public class AdminAuthService {

    /**
     * 管理员登录
     * 验证用户名和密码，生成登录 Token
     * @param username 用户名
     * @param password 密码
     * @return 登录成功后的管理员实体（包含新生成的 Token）
     * @throws BusinessException 用户名或密码错误时抛出异常
     */
    @Transactional
    public AdminUser login(String username, String password) {
        // 根据用户名查找管理员
        AdminUser admin = AdminUser.find("username", username).firstResult();
        if (admin == null) {
            throw new BusinessException(400, "用户名或密码错误");
        }

        // 检查账号状态
        if (admin.status == null || admin.status != 1) {
            throw new BusinessException(403, "账号已被禁用");
        }

        // 验证密码（BCrypt 比对）
        if (!BCrypt.checkpw(password, admin.password)) {
            throw new BusinessException(400, "用户名或密码错误");
        }

        // 生成新 Token，有效期 24 小时
        admin.token = UUID.randomUUID().toString();
        admin.tokenExpiresAt = LocalDateTime.now().plusHours(24);

        return admin;
    }

    /**
     * 验证 Token 有效性
     * @param token 待验证的 Token
     * @return 管理员ID（验证成功），null（验证失败）
     */
    public Long validateToken(String token) {
        AdminUser admin = AdminUser.find("token = ?1 AND tokenExpiresAt > ?2",
                token, LocalDateTime.now()).firstResult();
        return admin != null ? admin.id : null;
    }

    /**
     * 管理员登出
     * 清除 Token 信息
     * @param adminId 管理员ID
     */
    @Transactional
    public void logout(Long adminId) {
        AdminUser admin = AdminUser.findById(adminId);
        if (admin != null) {
            admin.token = null;
            admin.tokenExpiresAt = null;
        }
    }
}
