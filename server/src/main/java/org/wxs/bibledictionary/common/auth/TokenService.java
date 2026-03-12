package org.wxs.bibledictionary.common.auth;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import org.wxs.bibledictionary.auth.entity.User;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Token 管理服务
 * 使用 Caffeine 内存缓存加速 Token 验证
 * Token 存储在数据库中，缓存作为加速层
 */
@ApplicationScoped
public class TokenService {

    /** Token 有效期：7 天 */
    private static final int TOKEN_EXPIRE_DAYS = 7;

    /** 内存缓存：token -> userId，30 分钟自动过期 */
    private Cache<String, Long> tokenCache;

    @PostConstruct
    void init() {
        tokenCache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofMinutes(30))
                .maximumSize(10000)
                .build();
    }

    /**
     * 生成新的 Token
     * @return 生成的 UUID Token
     */
    public String generateToken() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    /**
     * 获取 Token 过期时间（当前时间 + 7天）
     */
    public LocalDateTime getTokenExpireTime() {
        return LocalDateTime.now().plusDays(TOKEN_EXPIRE_DAYS);
    }

    /**
     * 验证 Token 并返回用户ID
     * 优先从缓存获取，缓存未命中则查数据库
     * @param token 待验证的 Token
     * @return 用户ID，Token 无效时返回 null
     */
    public Long validateToken(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }

        // 优先查缓存
        Long cachedUserId = tokenCache.getIfPresent(token);
        if (cachedUserId != null) {
            return cachedUserId;
        }

        // 缓存未命中，查数据库
        User user = User.find("token = ?1 AND tokenExpiresAt > ?2",
                token, LocalDateTime.now()).firstResult();
        if (user != null) {
            // 写入缓存
            tokenCache.put(token, user.id);
            return user.id;
        }

        return null;
    }

    /**
     * 使 Token 缓存失效（用于退出登录）
     */
    public void invalidateToken(String token) {
        if (token != null) {
            tokenCache.invalidate(token);
        }
    }
}
