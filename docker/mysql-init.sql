-- MySQL 初始化脚本
-- 授予用户从任意主机连接的权限（解决 Docker 网络问题）

-- 创建用户并授权（允许从任意 IP 连接）
CREATE USER IF NOT EXISTS 'bible_dictionary'@'%' IDENTIFIED BY 'bible_dictionary123';
GRANT ALL PRIVILEGES ON `bible_dictionary`.* TO 'bible_dictionary'@'%';
FLUSH PRIVILEGES;
