// 인스턴스별 설정은 deploy/project.conf 에서 관리합니다.
// setup.sh 가 project.conf 를 읽어 환경변수로 export 하므로
// 이 파일을 직접 편집할 필요가 없습니다.
const APP_NAME    = process.env.APP_NAME    || "dicpress";
const DEPLOY_PATH = process.env.DEPLOY_PATH || __dirname;
const PORT        = parseInt(process.env.PORT || "3001");

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
