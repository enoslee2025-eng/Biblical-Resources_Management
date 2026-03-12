package org.wxs.bibledictionary.console.common.auth;

import jakarta.enterprise.context.RequestScoped;

/**
 * 当前请求的管理员上下文
 * 在 AdminAuthFilter 中设置，在 Resource 中注入使用
 * 仅在 /private/ 路径下有效
 */
@RequestScoped
public class AdminContext {

    /** 当前登录管理员的ID */
    private Long adminId;

    /**
     * 获取当前管理员ID
     * @return 管理员ID
     */
    public Long getAdminId() {
        return adminId;
    }

    /**
     * 设置当前管理员ID
     * @param adminId 管理员ID
     */
    public void setAdminId(Long adminId) {
        this.adminId = adminId;
    }
}
