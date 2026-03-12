package org.wxs.bibledictionary.console.dashboard.service;

import jakarta.enterprise.context.ApplicationScoped;
import org.wxs.bibledictionary.console.resource.entity.Resource;
import org.wxs.bibledictionary.console.user.entity.User;

import java.util.HashMap;
import java.util.Map;

/**
 * 仪表盘服务
 * 提供后台管理首页的统计数据
 */
@ApplicationScoped
public class DashboardService {

    /**
     * 获取仪表盘统计数据
     * 包括用户总数、资源总数、各类型资源数量、公开资源数量
     * @return 统计数据 Map
     */
    public Map<String, Object> getStats() {
        Map<String, Object> stats = new HashMap<>();

        // 用户总数
        stats.put("userCount", User.count());

        // 资源总数
        stats.put("resourceCount", Resource.count());

        // 各类型资源数量
        stats.put("bibleCount", Resource.count("type", "bible"));
        stats.put("commentaryCount", Resource.count("type", "commentary"));
        stats.put("dictionaryCount", Resource.count("type", "dictionary"));

        // 公开资源数量
        stats.put("publicCount", Resource.count("isPublic", 1));

        return stats;
    }
}
