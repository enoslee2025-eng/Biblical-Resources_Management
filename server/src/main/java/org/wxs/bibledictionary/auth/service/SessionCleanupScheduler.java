package org.wxs.bibledictionary.auth.service;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.wxs.bibledictionary.auth.entity.QrLoginSession;
import org.jboss.logging.Logger;

/**
 * 二维码会话定时清理器
 * 每10分钟清理一次过期的二维码登录会话，保持数据库整洁
 */
@ApplicationScoped
public class SessionCleanupScheduler {

    private static final Logger LOG = Logger.getLogger(SessionCleanupScheduler.class);

    /**
     * 定时清理过期会话
     * 每10分钟执行一次，删除过期超过10分钟的会话
     */
    @Scheduled(every = "10m")
    @Transactional
    void cleanupExpiredSessions() {
        long deleted = QrLoginSession.delete(
                "expiresAt < ?1",
                java.time.LocalDateTime.now().minusMinutes(10)
        );
        if (deleted > 0) {
            LOG.infof("清理了 %d 个过期的二维码登录会话", deleted);
        }
    }
}
