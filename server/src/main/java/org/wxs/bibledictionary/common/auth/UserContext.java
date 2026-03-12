package org.wxs.bibledictionary.common.auth;

import jakarta.enterprise.context.RequestScoped;

/**
 * 当前请求的用户上下文
 * 在 AuthFilter 中设置，在 Resource 中注入使用
 * 仅在 /private/api/* 路径下有效
 */
@RequestScoped
public class UserContext {

    /** 当前登录用户的ID */
    private Long userId;

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }
}
