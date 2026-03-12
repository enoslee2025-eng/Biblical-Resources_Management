package org.wxs.bibledictionary.console.dashboard.resource;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.wxs.bibledictionary.console.common.response.Result;
import org.wxs.bibledictionary.console.dashboard.service.DashboardService;

import java.util.Map;

/**
 * 仪表盘接口
 * 提供后台管理首页统计数据
 * 需要管理员登录后才能访问
 */
@Path("/private/api/admin/dashboard")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class DashboardResource {

    @Inject
    DashboardService dashboardService;

    /**
     * 获取仪表盘统计数据
     * @return 包含用户数、资源数等统计信息
     */
    @GET
    @Path("/stats")
    public Result<Map<String, Object>> getStats() {
        return Result.ok(dashboardService.getStats());
    }
}
