/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("path");
const { name: APP_NAME } = require("./package.json");
const PORT = parseInt(process.env.PORT || "3001");

module.exports = {
  apps: [
    {
      name: APP_NAME,
      script: path.join(__dirname, ".next/standalone/server.js"),
      env_production: {
        NODE_ENV: "production",
        PORT,
        HOSTNAME: "127.0.0.1",
        AUTH_TRUST_HOST: "true",
      },
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "512M",
      error_file: path.join(__dirname, "logs/err.log"),
      out_file: path.join(__dirname, "logs/out.log"),
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: "10s",
    },
  ],
};
