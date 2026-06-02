const { spawnSync } = require("node:child_process");

const platform = process.platform;

// 두 백엔드를 모두 빌드: 블로그(BlogPublisher) + 유튜브 쇼츠 생성기(YoutubeGenerator).
const builds =
  platform === "win32"
    ? [
        { file: "cmd", args: ["/c", "backend\\build-windows.bat"] },
        { file: "cmd", args: ["/c", "youtube-backend\\build-youtube-windows.bat"] },
      ]
    : platform === "darwin"
      ? [
          { file: "bash", args: ["backend/build-macos.sh"] },
          { file: "bash", args: ["youtube-backend/build-youtube-macos.sh"] },
        ]
      : null;

if (!builds) {
  console.error(`[build-backend] unsupported platform: ${platform}`);
  process.exit(1);
}

for (const command of builds) {
  const result = spawnSync(command.file, command.args, {
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    console.error(`[build-backend] failed to start: ${result.error.message}`);
    process.exit(1);
  }
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

process.exit(0);
