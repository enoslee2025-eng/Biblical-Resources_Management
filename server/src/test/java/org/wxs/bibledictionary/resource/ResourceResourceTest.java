package org.wxs.bibledictionary.resource;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.BeforeAll;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/**
 * 资源接口单元测试
 * 测试圣经译本资源的增删改查和导出
 */
@QuarkusTest
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
public class ResourceResourceTest {

    /** 登录Token，通过扫码流程获取 */
    private static String token;

    /** 创建的资源ID */
    private static Long resourceId;

    /**
     * 测试前先完成登录，获取Token
     */
    @BeforeAll
    public static void setup() {
        // 创建二维码
        var qrResponse = given()
                .contentType(ContentType.JSON)
                .when()
                .post("/public/api/auth/qr/create")
                .then()
                .extract().response();

        String sessionId = qrResponse.jsonPath().getString("data.id");
        String sessionCode = qrResponse.jsonPath().getString("data.code");

        // APP 确认登录
        given()
                .contentType(ContentType.JSON)
                .body("{\"id\":\"" + sessionId + "\",\"code\":\"" + sessionCode + "\",\"uid\":20001}")
                .when()
                .post("/public/api/auth/qr/confirm");

        // 获取Token
        var statusResponse = given()
                .when()
                .get("/public/api/auth/qr/status?id=" + sessionId)
                .then()
                .extract().response();

        token = statusResponse.jsonPath().getString("data.token");
    }

    /**
     * 测试创建圣经译本资源
     */
    @Test
    @Order(1)
    public void testCreateResource() {
        String body = "{\"type\":\"bible\",\"title\":\"测试译本\",\"metaJson\":\"{\\\"abbr\\\":\\\"TEST\\\",\\\"iso\\\":\\\"zh\\\"}\"}";

        var response = given()
                .header("Authorization", "Bearer " + token)
                .contentType(ContentType.JSON)
                .body(body)
                .when()
                .post("/private/api/resource/create")
                .then()
                .statusCode(200)
                .body("code", equalTo(200))
                .body("data.title", equalTo("测试译本"))
                .body("data.type", equalTo("bible"))
                .extract().response();

        resourceId = response.jsonPath().getLong("data.id");
    }

    /**
     * 测试获取资源列表
     */
    @Test
    @Order(2)
    public void testListResources() {
        given()
                .header("Authorization", "Bearer " + token)
                .when()
                .get("/private/api/resource/list")
                .then()
                .statusCode(200)
                .body("code", equalTo(200))
                .body("data.size()", greaterThan(0));
    }

    /**
     * 测试获取资源详情
     */
    @Test
    @Order(3)
    public void testGetResourceDetail() {
        given()
                .header("Authorization", "Bearer " + token)
                .when()
                .get("/private/api/resource/detail/" + resourceId)
                .then()
                .statusCode(200)
                .body("code", equalTo(200))
                .body("data.title", equalTo("测试译本"));
    }

    /**
     * 测试更新资源
     */
    @Test
    @Order(4)
    public void testUpdateResource() {
        String body = "{\"title\":\"更新后的译本\",\"contentJson\":\"[{\\\"name\\\":\\\"创世记\\\"}]\"}";

        given()
                .header("Authorization", "Bearer " + token)
                .contentType(ContentType.JSON)
                .body(body)
                .when()
                .put("/private/api/resource/update/" + resourceId)
                .then()
                .statusCode(200)
                .body("code", equalTo(200))
                .body("data.title", equalTo("更新后的译本"));
    }

    /**
     * 测试导出资源
     */
    @Test
    @Order(5)
    public void testExportResource() {
        given()
                .header("Authorization", "Bearer " + token)
                .when()
                .get("/private/api/resource/export/" + resourceId)
                .then()
                .statusCode(200)
                .body(containsString("\"type\":\"bible\""));
    }

    /**
     * 测试复制资源
     * 复制已创建的资源，验证副本标题包含"（副本）"后缀
     */
    @Test
    @Order(6)
    public void testCopyResource() {
        given()
                .header("Authorization", "Bearer " + token)
                .contentType(ContentType.JSON)
                .when()
                .post("/private/api/resource/copy/" + resourceId)
                .then()
                .statusCode(200)
                .body("code", equalTo(200))
                .body("data.title", endsWith("（副本）"));
    }

    /**
     * 测试获取资源摘要
     * 验证摘要包含资源类型等统计信息
     */
    @Test
    @Order(7)
    public void testGetResourceSummary() {
        given()
                .header("Authorization", "Bearer " + token)
                .when()
                .get("/private/api/resource/summary/" + resourceId)
                .then()
                .statusCode(200)
                .body("code", equalTo(200))
                .body("data.type", notNullValue());
    }

    /**
     * 测试切换资源公开状态
     * 将资源设为公开，验证 isPublic 字段更新为 1
     */
    @Test
    @Order(8)
    public void testTogglePublic() {
        given()
                .header("Authorization", "Bearer " + token)
                .contentType(ContentType.JSON)
                .body("{\"isPublic\": 1}")
                .when()
                .put("/private/api/resource/update/" + resourceId)
                .then()
                .statusCode(200)
                .body("code", equalTo(200))
                .body("data.isPublic", equalTo(1));
    }

    /**
     * 测试删除资源
     */
    @Test
    @Order(9)
    public void testDeleteResource() {
        given()
                .header("Authorization", "Bearer " + token)
                .when()
                .delete("/private/api/resource/delete/" + resourceId)
                .then()
                .statusCode(200)
                .body("code", equalTo(200));
    }
}
