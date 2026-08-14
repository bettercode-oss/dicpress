// ── 프로젝트별 설정 ── 새 프로젝트 적용 시 이 블록만 수정하세요 ──
const APP_NAME   = "dic";
const DEPLOY_PATH = "/var/www/dic.bizos.kr";
const PORT        = 3001;
// ─────────────────────────────────────────────────────────────────

module.exports = {
  apps: [
    {
      name: APP_NAME,
      script: "node",
      args: ".next/standalone/server.js",
      cwd: DEPLOY_PATH,
      env_production: {
        NODE_ENV: "production",
        PORT,
        HOSTNAME: "127.0.0.1",
      },
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "512M",
      error_file: "logs/err.log",
      out_file: "logs/out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: "10s",
    },
  ],
};
