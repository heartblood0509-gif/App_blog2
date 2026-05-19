const { spawnSync } = require("node:child_process");

const platform = process.platform;
const command =
  platform === "win32"
    ? { file: "cmd", args: ["/c", "backend\\build-windows.bat"] }
    : platform === "darwin"
      ? { file: "bash", args: ["backend/build-macos.sh"] }
      : null;

if (!command) {
  console.error(`[build-backend] unsupported platform: ${platform}`);
  process.exit(1);
}

const result = spawnSync(command.file, command.args, {
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  console.error(`[build-backend] failed to start: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
