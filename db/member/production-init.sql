-- 新しい本番PG volumeの初期化時だけ実行する。Webはsuperuserで接続しない。
\getenv app_password MEMBER_POSTGRES_PASSWORD
CREATE ROLE gk_member LOGIN PASSWORD :'app_password';
ALTER DATABASE graph_member OWNER TO gk_member;
REVOKE ALL ON DATABASE graph_member FROM PUBLIC;
GRANT CONNECT ON DATABASE graph_member TO gk_member;
ALTER SCHEMA public OWNER TO gk_member;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
