import { app, BrowserWindow, ipcMain, shell, clipboard } from "electron";
import * as path from "path";
import * as os from "os";
import * as pty from "node-pty";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import archiver from "archiver";
import * as yauzl from "yauzl";

const execAsync = promisify(exec);

const isDev = process.env.NODE_ENV === "development";

// 설정 관련 함수들
const SETTINGS_FOLDER = path.join(os.homedir(), ".p-desktop");
const LAST_PATH_FILE = path.join(SETTINGS_FOLDER, "last_path.txt");

function createSettingsFolder(): void {
  try {
    // 설정 폴더가 존재하지 않으면 생성
    if (!fs.existsSync(SETTINGS_FOLDER)) {
      fs.mkdirSync(SETTINGS_FOLDER, { recursive: true });
      console.log("✅ 설정 폴더가 생성되었습니다:", SETTINGS_FOLDER);
    } else {
      console.log("📁 설정 폴더가 이미 존재합니다:", SETTINGS_FOLDER);
    }
  } catch (error) {
    console.error("❌ 설정 폴더 생성 실패:", error);
  }
}

function saveLastPath(dirPath: string): void {
  try {
    // 설정 폴더가 없으면 생성
    if (!fs.existsSync(SETTINGS_FOLDER)) {
      fs.mkdirSync(SETTINGS_FOLDER, { recursive: true });
    }

    fs.writeFileSync(LAST_PATH_FILE, dirPath, "utf-8");
    console.log("✅ 마지막 경로가 저장되었습니다:", { path: dirPath, settingsFile: LAST_PATH_FILE });
  } catch (error) {
    console.error("❌ 경로 저장 실패:", { error, settingsFile: LAST_PATH_FILE, settingsFolder: SETTINGS_FOLDER });
  }
}

function getLastPath(): string | null {
  try {
    console.log("🔍 설정 파일 확인:", { settingsFile: LAST_PATH_FILE, exists: fs.existsSync(LAST_PATH_FILE) });

    if (fs.existsSync(LAST_PATH_FILE)) {
      const savedPath = fs.readFileSync(LAST_PATH_FILE, "utf-8").trim();
      console.log("📂 저장된 경로를 불러왔습니다:", { savedPath, fileExists: fs.existsSync(savedPath) });
      return savedPath;
    }
    console.log("⚠️ 저장된 경로가 없습니다 - 첫 실행이거나 설정 파일이 없음");
    return null;
  } catch (error) {
    console.error("❌ 경로 불러오기 실패:", { error, settingsFile: LAST_PATH_FILE });
    return null;
  }
}

function ensurePromptFolder(dirPath: string): void {
  try {
    const promptFolderPath = path.join(dirPath, "프롬프트");

    if (!fs.existsSync(promptFolderPath)) {
      fs.mkdirSync(promptFolderPath, { recursive: true });
      console.log("✅ 프롬프트 폴더가 생성되었습니다:", promptFolderPath);
    } else {
      console.log("📁 프롬프트 폴더가 이미 존재합니다:", promptFolderPath);
    }
  } catch (error) {
    console.error("❌ 프롬프트 폴더 생성 실패:", error);
  }
}

function ensurePackageJson(dirPath: string): void {
  try {
    const packageJsonPath = path.join(dirPath, "package.json");

    if (!fs.existsSync(packageJsonPath)) {
      // 기본 package.json 내용 생성
      const defaultPackageJson = {
        name: path.basename(dirPath),
        version: "1.0.0",
        description: "",
        main: "index.js",
        scripts: {},
        keywords: [],
        author: "",
        license: "ISC",
      };

      fs.writeFileSync(
        packageJsonPath,
        JSON.stringify(defaultPackageJson, null, 2),
        "utf-8"
      );
      console.log("✅ package.json이 생성되었습니다:", packageJsonPath);
    } else {
      console.log("📦 package.json이 이미 존재합니다:", packageJsonPath);
    }
  } catch (error) {
    console.error("❌ package.json 생성 실패:", error);
  }
}

async function selectInitialDirectory(): Promise<string | null> {
  const { dialog } = require("electron");
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "작업할 기본 폴더를 선택하세요",
    buttonLabel: "선택",
    message: "프로그램에서 사용할 기본 작업 폴더를 선택해주세요.",
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];

    // 선택된 경로에 프롬프트 폴더 생성/확인
    ensurePromptFolder(selectedPath);

    // package.json이 없으면 생성
    ensurePackageJson(selectedPath);

    saveLastPath(selectedPath);
    return selectedPath;
  }
  return null;
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    height: 800,
    width: 1200,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3001");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  // 프로그램 시작시 설정 폴더 생성
  createSettingsFolder();

  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

// 터미널 관련 IPC 핸들러
const terminals: { [key: string]: pty.IPty } = {};
let currentWorkingDirectory: string = process.cwd(); // 현재 작업 디렉토리 저장

ipcMain.handle("terminal-create", (event, id: string, workingDir?: string) => {
  try {
    const isWindows = os.platform() === "win32";
    const shell = isWindows ? "powershell.exe" : process.env.SHELL || "/bin/bash";

    // shell 인자 설정 (login shell로 실행하여 profile 로드)
    const shellArgs = isWindows ? [] : ["-l"];

    // Windows와 Unix 환경변수 분리
    const terminalEnv = isWindows
      ? {
          ...process.env,
          // Windows ConPTY는 UTF-8 지원
          PYTHONIOENCODING: "utf-8",
          // PowerShell에서 색상 지원
          TERM: "xterm-256color",
        }
      : {
          ...process.env,
          TERM: "xterm-256color",
          LANG: "en_US.UTF-8",
          LC_ALL: "en_US.UTF-8",
          COLORTERM: "truecolor",
          PATH: process.env.PATH || "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
        };

    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: workingDir || currentWorkingDirectory, // 선택된 폴더를 작업 디렉토리로 설정
      env: terminalEnv,
      handleFlowControl: false,
    });

    terminals[id] = ptyProcess;

    ptyProcess.onData((data) => {
      // URL 감지 및 브라우저 열기 지원
      const urlRegex = /https?:\/\/[^\s\)]+/g;
      const urls = data.match(urlRegex);

      if (urls) {
        urls.forEach(url => {
          console.log("🔗 터미널에서 URL 감지됨:", url);
          // URL 감지 정보를 렌더러로 전송
          event.sender.send("terminal-url-detected", id, url);
        });
      }

      event.sender.send("terminal-data", id, data);
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      delete terminals[id];
      event.sender.send("terminal-exit", id, { exitCode, signal });
    });

    console.log(`✅ 터미널 생성 성공: ${shell} (${isWindows ? "Windows" : "Unix"})`);
    return true;
  } catch (error: any) {
    console.error("터미널 생성 실패:", error);

    // Windows 특화 에러 메시지
    let errorMessage = "터미널 생성에 실패했습니다.\r\n";

    if (os.platform() === "win32") {
      if (error.message?.includes("spawn")) {
        errorMessage = "PowerShell을 찾을 수 없습니다. Windows PowerShell이 설치되어 있는지 확인하세요.\r\n";
      } else if (error.message?.includes("ENOENT")) {
        errorMessage = "터미널 실행 파일을 찾을 수 없습니다.\r\n";
      } else if (error.message?.includes("EACCES") || error.message?.includes("permission")) {
        errorMessage = "터미널 실행 권한이 없습니다. 관리자 권한으로 실행해보세요.\r\n";
      } else if (error.code === "ERR_PTY_SPAWN_FAILED") {
        errorMessage = "node-pty 네이티브 모듈 오류입니다. 'npm run rebuild' 실행이 필요할 수 있습니다.\r\n";
      }
    }

    event.sender.send("terminal-data", id, errorMessage + `상세 오류: ${error.message || error}\r\n`);
    return false;
  }
});

ipcMain.handle("terminal-write", (_, id: string, data: string) => {
  try {
    if (terminals[id]) {
      terminals[id].write(data);
    }
  } catch (error) {
    console.error("터미널 쓰기 실패:", error);
  }
});

ipcMain.handle(
  "terminal-resize",
  (_, id: string, cols: number, rows: number) => {
    try {
      if (terminals[id]) {
        terminals[id].resize(cols, rows);
      }
    } catch (error) {
      console.error("터미널 리사이즈 실패:", error);
    }
  }
);

ipcMain.handle("terminal-kill", (_, id: string) => {
  try {
    if (terminals[id]) {
      terminals[id].kill();
      delete terminals[id];
    }
  } catch (error) {
    console.error("터미널 종료 실패:", error);
  }
});

// 파일 시스템 관련 IPC 핸들러

ipcMain.handle("fs-readdir", async (_, dirPath: string) => {
  try {
    const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return files.map((file) => ({
      name: file.name,
      isDirectory: file.isDirectory(),
      isFile: file.isFile(),
    }));
  } catch (error) {
    throw error;
  }
});

ipcMain.handle("fs-readfile", async (_, filePath: string) => {
  try {
    const content = await fs.promises.readFile(filePath, "utf-8");
    return content;
  } catch (error) {
    throw error;
  }
});

ipcMain.handle("fs-writefile", async (_, filePath: string, content: string) => {
  try {
    await fs.promises.writeFile(filePath, content, "utf-8");
    return true;
  } catch (error) {
    throw error;
  }
});

ipcMain.handle("fs-deletefile", async (_, filePath: string) => {
  try {
    await fs.promises.unlink(filePath);
    console.log("✅ 파일이 삭제되었습니다:", filePath);
    return true;
  } catch (error) {
    console.error("❌ 파일 삭제 실패:", error);
    throw error;
  }
});

ipcMain.handle("fs-deletefolder", async (_, folderPath: string) => {
  try {
    await fs.promises.rmdir(folderPath, { recursive: true });
    console.log("✅ 폴더가 삭제되었습니다:", folderPath);
    return true;
  } catch (error) {
    console.error("❌ 폴더 삭제 실패:", error);
    throw error;
  }
});

ipcMain.handle("delete-script", async (_, scriptName: string) => {
  try {
    const packageJsonPath = path.join(currentWorkingDirectory, "package.json");

    // package.json 읽기
    const packageJsonContent = await fs.promises.readFile(
      packageJsonPath,
      "utf-8"
    );
    const packageJson = JSON.parse(packageJsonContent);

    // scripts에서 해당 스크립트 삭제
    if (packageJson.scripts && packageJson.scripts[scriptName]) {
      delete packageJson.scripts[scriptName];

      // package.json 다시 쓰기
      await fs.promises.writeFile(
        packageJsonPath,
        JSON.stringify(packageJson, null, 2),
        "utf-8"
      );
      console.log("✅ 스크립트가 삭제되었습니다:", scriptName);
      return true;
    } else {
      throw new Error(`스크립트 "${scriptName}"를 찾을 수 없습니다.`);
    }
  } catch (error) {
    console.error("❌ 스크립트 삭제 실패:", error);
    throw error;
  }
});

ipcMain.handle("get-default-path", async () => {
  // 저장된 마지막 경로를 반환, 없으면 현재 디렉토리
  const lastPath = getLastPath();
  if (lastPath && fs.existsSync(lastPath)) {
    // 기존 경로에도 프롬프트 폴더 생성/확인
    ensurePromptFolder(lastPath);

    // package.json이 없으면 생성
    ensurePackageJson(lastPath);

    // 현재 작업 디렉토리 업데이트
    currentWorkingDirectory = lastPath;

    return lastPath;
  }

  // 저장된 경로가 없거나 유효하지 않으면 폴더 선택 창 띄우기
  const selectedPath = await selectInitialDirectory();
  if (selectedPath) {
    // 현재 작업 디렉토리 업데이트
    currentWorkingDirectory = selectedPath;
    return selectedPath;
  }

  // 사용자가 취소하면 프로그램 종료
  console.log("❌ 사용자가 폴더 선택을 취소했습니다. 프로그램을 종료합니다.");
  app.quit();
  return process.cwd(); // 이 줄은 실행되지 않지만 타입 에러 방지용
});

// 경로 변경시 저장
ipcMain.handle("save-current-path", (_, dirPath: string) => {
  saveLastPath(dirPath);
  // 현재 작업 디렉토리 업데이트
  currentWorkingDirectory = dirPath;
  return true;
});

// 폴더 선택 다이얼로그
ipcMain.handle("select-directory", async () => {
  const { dialog } = require("electron");
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "작업할 폴더를 선택하세요",
    buttonLabel: "선택",
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];

    // 선택된 경로에 프롬프트 폴더 생성/확인
    ensurePromptFolder(selectedPath);

    // package.json이 없으면 생성
    ensurePackageJson(selectedPath);

    // 현재 작업 디렉토리 업데이트
    currentWorkingDirectory = selectedPath;

    return selectedPath;
  }
  return null;
});

// 브라우저에서 URL 열기 IPC 핸들러
ipcMain.handle("open-url", async (_, url: string) => {
  try {
    await shell.openExternal(url);
    console.log("✅ 브라우저에서 URL 열기:", url);
    return true;
  } catch (error) {
    console.error("❌ URL 열기 실패:", error);
    return false;
  }
});

// 클립보드에 복사 IPC 핸들러
ipcMain.handle("copy-to-clipboard", (_, text: string) => {
  try {
    clipboard.writeText(text);
    console.log("✅ 클립보드에 복사됨:", text.substring(0, 50) + "...");
    return true;
  } catch (error) {
    console.error("❌ 클립보드 복사 실패:", error);
    return false;
  }
});

// 터미널 선택 텍스트 복사 지원
ipcMain.handle("copy-terminal-selection", (_, text: string) => {
  try {
    // 터미널 색상 코드 제거
    const cleanText = text.replace(/\x1b\[[0-9;]*m/g, '');
    clipboard.writeText(cleanText);
    console.log("✅ 터미널 텍스트 클립보드에 복사됨");
    return true;
  } catch (error) {
    console.error("❌ 터미널 텍스트 복사 실패:", error);
    return false;
  }
});

// Claude CLI 관련 IPC 핸들러
ipcMain.handle("check-claude-cli", async () => {
  try {
    const isWindows = os.platform() === "win32";

    if (isWindows) {
      // Windows에서는 cmd나 PowerShell에서 claude 명령어 확인
      try {
        await execAsync("claude --help", { timeout: 10000 });
        console.log("✅ Claude CLI가 설치되어 있습니다. (Windows)");
        return true;
      } catch (cmdError) {
        // PowerShell로도 시도
        try {
          await execAsync("powershell -Command \"claude --help\"", { timeout: 10000 });
          console.log("✅ Claude CLI가 설치되어 있습니다. (Windows PowerShell)");
          return true;
        } catch (psError) {
          console.log("❌ Claude CLI가 설치되어 있지 않습니다. (Windows)");
          console.log("CMD 오류:", cmdError);
          console.log("PowerShell 오류:", psError);
          return false;
        }
      }
    } else {
      // Unix/macOS에서는 기존 방식 사용
      await execAsync("/bin/bash -l -c 'claude --help'");
      console.log("✅ Claude CLI가 설치되어 있습니다. (Unix/macOS)");
      return true;
    }
  } catch (error) {
    console.log("❌ Claude CLI가 설치되어 있지 않습니다.");
    console.log("오류 상세:", error);
    return false;
  }
});

// 비밀번호 검증 IPC 핸들러
ipcMain.handle("validate-password", async (_, password: string) => {
  try {
    const isWindows = os.platform() === "win32";

    if (isWindows) {
      // Windows에서는 비밀번호 검증이 필요 없음 (UAC가 처리)
      console.log("✅ Windows에서는 비밀번호 검증 불필요");
      return true;
    } else {
      // Unix/macOS에서는 sudo 비밀번호 검증
      await execAsync(`/bin/bash -l -c "echo '${password}' | sudo -S whoami"`, {
        timeout: 10000, // 10초 타임아웃
      });
      console.log("✅ 관리자 비밀번호 인증 성공");
      return true;
    }
  } catch (error) {
    console.log("❌ 관리자 비밀번호 인증 실패:", error);
    return false;
  }
});

ipcMain.handle("install-claude-cli", async (_, password: string) => {
  let command = "";
  try {
    console.log("🚀 Claude CLI 설치를 시작합니다...");

    const isWindows = os.platform() === "win32";
    console.log(`플랫폼: ${isWindows ? 'Windows' : 'Unix/macOS'}`);

    // 먼저 환경 변수와 PATH 확인
    console.log("현재 PATH:", process.env.PATH);
    console.log("현재 작업 디렉토리:", process.cwd());

    // 여러 방법으로 npm 찾기 시도
    let npmFound = false;
    let npmPath = "";

    if (isWindows) {
      // Windows에서 npm 찾기
      try {
        const { stdout } = await execAsync("where npm");
        npmPath = stdout.trim().split('\n')[0]; // 첫 번째 결과 사용
        npmFound = true;
        console.log("✅ where npm 성공:", npmPath);
      } catch (whereError) {
        console.log("❌ where npm 실패:", whereError);

        // npm.cmd 시도
        try {
          const { stdout } = await execAsync("where npm.cmd");
          npmPath = stdout.trim().split('\n')[0];
          npmFound = true;
          console.log("✅ where npm.cmd 성공:", npmPath);
        } catch (cmdError) {
          console.log("❌ where npm.cmd 실패:", cmdError);
        }
      }
    } else {
      // Unix/macOS에서 npm 찾기 (기존 로직)
      try {
        const { stdout } = await execAsync("which npm");
        npmPath = stdout.trim();
        npmFound = true;
        console.log("✅ which npm 성공:", npmPath);
      } catch (whichError) {
        console.log("❌ which npm 실패:", whichError);
      }
    }

    // Unix/macOS에서만 추가 npm 찾기 시도
    if (!npmFound && !isWindows) {
      // 2. whereis npm (Linux/Unix)
      try {
        const { stdout } = await execAsync("whereis npm");
        console.log("whereis npm 결과:", stdout.trim());
        if (stdout.includes("/")) {
          npmFound = true;
          npmPath = stdout.split(" ").find(path => path.includes("/npm")) || "";
        }
      } catch (whereisError) {
        console.log("❌ whereis npm 실패:", whereisError);
      }

      // 3. 쉘 환경에서 npm 경로 찾기 (volta, nvm, fnm 등 지원)
      if (!npmFound) {
        const shells = ['/bin/bash', '/bin/zsh', '/bin/sh'];

        for (const shell of shells) {
          try {
            // 쉘을 통해 환경 변수를 로드하고 npm 경로 찾기
            const { stdout } = await execAsync(`${shell} -c "source ~/.bashrc 2>/dev/null || source ~/.zshrc 2>/dev/null || source ~/.profile 2>/dev/null; which npm"`);
            if (stdout.trim()) {
              npmPath = stdout.trim();
              npmFound = true;
              console.log(`✅ ${shell}에서 npm 발견:`, npmPath);
              break;
            }
          } catch (e) {
            // 이 쉘에서는 찾지 못함
          }
        }
      }

      // 4. 직접 경로 확인 (일반적인 npm 설치 위치들)
      if (!npmFound) {
        const commonPaths = [
          "/usr/local/bin/npm",
          "/usr/bin/npm",
          "/opt/homebrew/bin/npm",
          `${process.env.HOME}/.volta/bin/npm`,
          `${process.env.HOME}/.fnm/current/bin/npm`,
          "/snap/bin/npm"
        ];

        // nvm 경로들 동적으로 찾기
        try {
          const { stdout: nvmPaths } = await execAsync(`find ${process.env.HOME}/.nvm/versions/node -name npm -type f 2>/dev/null | head -5`);
          if (nvmPaths.trim()) {
            commonPaths.push(...nvmPaths.trim().split('\n'));
          }
        } catch (e) {
          // nvm 경로 찾기 실패
        }

        for (const npmTestPath of commonPaths) {
          try {
            await execAsync(`test -f ${npmTestPath}`);
            npmPath = npmTestPath;
            npmFound = true;
            console.log("✅ 직접 경로에서 npm 발견:", npmPath);
            break;
          } catch (e) {
            // 해당 경로에 npm이 없음
          }
        }
      }
    }

    if (!npmFound) {
      console.log("❌ 모든 방법으로 npm을 찾을 수 없습니다.");
      return {
        success: false,
        error: `npm을 찾을 수 없습니다.\n\n현재 PATH: ${process.env.PATH}\n\n해결 방법:\n1. 터미널에서 'which npm' 실행해서 경로 확인\n2. Node.js가 제대로 설치되었는지 확인\n3. 터미널을 재시작하거나 PATH 환경변수 설정 확인`,
      };
    }

    console.log("✅ npm 발견:", npmPath);

    // Unix/macOS에서만 sudo 경로 찾기
    let sudoPath = "sudo";
    let sudoFound = false;

    if (!isWindows) {
      try {
        const { stdout } = await execAsync("which sudo");
        sudoPath = stdout.trim();
        sudoFound = true;
        console.log("✅ sudo 발견:", sudoPath);
      } catch {
        // 일반적인 sudo 경로들 확인
        const commonSudoPaths = ["/usr/bin/sudo", "/bin/sudo", "/usr/local/bin/sudo"];

        for (const testSudoPath of commonSudoPaths) {
          try {
            await execAsync(`test -f ${testSudoPath}`);
            sudoPath = testSudoPath;
            sudoFound = true;
            console.log("✅ 직접 경로에서 sudo 발견:", sudoPath);
            break;
          } catch (e) {
            // 해당 경로에 sudo 없음
          }
        }
      }

      if (!sudoFound) {
        console.log("❌ sudo를 찾을 수 없습니다. 권한 없이 설치 시도합니다.");
        // sudo 없이 설치 시도 (일부 시스템에서는 권한이 필요 없을 수도 있음)
      }
    } else {
      console.log("✅ Windows에서는 sudo가 필요하지 않습니다.");
    }

    // Node.js 버전도 확인
    try {
      let nodeVersion = "";
      let npmVersion = "";

      if (isWindows) {
        // Windows에서 버전 확인
        try {
          const { stdout } = await execAsync("node --version");
          nodeVersion = stdout.trim();
        } catch {
          console.log("Node.js 버전 확인 실패");
        }

        try {
          const { stdout } = await execAsync(`"${npmPath}" --version`);
          npmVersion = stdout.trim();
        } catch {
          const { stdout } = await execAsync("npm --version");
          npmVersion = stdout.trim();
        }
      } else {
        // Unix/macOS에서 버전 확인
        const nodePath = npmPath.replace('/npm', '/node');
        try {
          const { stdout } = await execAsync(`${nodePath} --version`);
          nodeVersion = stdout.trim();
        } catch {
          const { stdout } = await execAsync("node --version");
          nodeVersion = stdout.trim();
        }

        const { stdout } = await execAsync(`${npmPath} --version`);
        npmVersion = stdout.trim();
      }

      console.log(`Node.js 버전: ${nodeVersion}, npm 버전: ${npmVersion}`);
      console.log(`npm 경로: ${npmPath}`);
    } catch (versionError) {
      console.log("버전 확인 실패:", versionError);
    }

    // 플랫폼별 설치 명령어 구성
    let shellCommand: string;

    console.log("터미널과 동일한 환경으로 설치 실행 중...");

    if (isWindows) {
      // Windows에서는 관리자 권한 없이 설치 (npm이 UAC 처리)
      shellCommand = `"${npmPath}" install -g @anthropic-ai/claude-code`;
      console.log("Windows에서 npm 글로벌 설치 실행 중...");
    } else {
      // Unix/macOS에서는 sudo 사용
      shellCommand = `/bin/bash -l -c "echo '${password}' | sudo -S ${npmPath} install -g @anthropic-ai/claude-code"`;
      console.log("로그인 쉘로 실행하여 터미널과 동일한 PATH 환경을 사용합니다.");
    }

    command = shellCommand;
    console.log("실행할 명령어:", command.replace(password || '', "****"));

    // 플랫폼별 설치 실행
    const { stdout, stderr } = await execAsync(command, {
      timeout: 300000, // 5분 타임아웃
    });

    console.log("설치 결과 (stdout):", stdout);
    if (stderr) {
      console.log("설치 경고 (stderr):", stderr);
    }

    // 설치 완료 후 확인 - 플랫폼별 환경 사용
    console.log("📋 Claude CLI 설치 확인 중...");

    // 잠깐 대기 (설치 완료 후 시스템에서 인식할 시간)
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      // 플랫폼별 claude 실행 확인
      if (isWindows) {
        // Windows에서 claude 명령어 확인
        try {
          const { stdout } = await execAsync("claude --help", { timeout: 15000 });
          console.log("✅ Claude CLI 설치 및 실행 확인 완료! (Windows CMD)");
          console.log("Claude CLI 버전:", stdout.split('\n')[0] || '확인됨');
          return { success: true };
        } catch (cmdError) {
          // PowerShell로도 시도
          const { stdout } = await execAsync("powershell -Command \"claude --help\"", { timeout: 15000 });
          console.log("✅ Claude CLI 설치 및 실행 확인 완료! (Windows PowerShell)");
          console.log("Claude CLI 버전:", stdout.split('\n')[0] || '확인됨');
          return { success: true };
        }
      } else {
        // Unix/macOS에서 터미널과 동일한 환경에서 claude 실행
        const { stdout } = await execAsync("/bin/bash -l -c 'claude --help'", {
          timeout: 15000, // 15초 타임아웃
        });

        console.log("✅ Claude CLI 설치 및 실행 확인 완료! (Unix/macOS)");
        console.log("Claude CLI 버전:", stdout.split('\n')[0] || '확인됨');
        return { success: true };
      }

    } catch (verifyError: any) {
      console.error("❌ Claude CLI 확인 실패:", verifyError);

      // 플랫폼별 디버깅 정보 수집
      let debugInfo = "\n=== 디버깅 정보 ===";

      if (isWindows) {
        // Windows 디버깅 정보
        try {
          const { stdout: pathInfo } = await execAsync("echo %PATH%");
          debugInfo += `\n시스템 PATH: ${pathInfo.trim()}`;
        } catch (e) {
          debugInfo += "\nPATH 확인 실패";
        }

        try {
          const { stdout: whereClaude } = await execAsync("where claude");
          debugInfo += `\nwhere claude: ${whereClaude.trim()}`;
        } catch (e) {
          debugInfo += "\nwhere claude: 찾을 수 없음";
        }

        try {
          const { stdout: npmBin } = await execAsync(`"${npmPath}" bin -g`);
          debugInfo += `\nnpm 글로벌 bin: ${npmBin.trim()}`;

          // npm bin 경로에 claude가 있는지 확인
          try {
            const { stdout: claudeInBin } = await execAsync(`dir "${npmBin.trim()}\\claude*"`);
            debugInfo += `\nnpm bin의 claude: ${claudeInBin.trim()}`;
          } catch {
            debugInfo += "\nnpm bin의 claude: 없음";
          }
        } catch (e) {
          debugInfo += "\nnpm bin 확인 실패";
        }
      } else {
        // Unix/macOS 디버깅 정보 (기존 로직)
        try {
          const { stdout: pathInfo } = await execAsync("/bin/bash -l -c 'echo $PATH'");
          debugInfo += `\n터미널 PATH: ${pathInfo.trim()}`;
        } catch (e) {
          debugInfo += "\nPATH 확인 실패";
        }

        try {
          const { stdout: whichClaude } = await execAsync("/bin/bash -l -c 'which claude'");
          debugInfo += `\nwhich claude: ${whichClaude.trim()}`;
        } catch (e) {
          debugInfo += "\nwhich claude: 찾을 수 없음";
        }

        try {
          const { stdout: npmBin } = await execAsync("/bin/bash -l -c 'npm bin -g'");
          debugInfo += `\nnpm 글로벌 bin: ${npmBin.trim()}`;

          // npm bin 경로에 claude가 있는지 확인
          const { stdout: claudeInBin } = await execAsync(`ls -la "${npmBin.trim()}/claude" 2>/dev/null || echo "없음"`);
          debugInfo += `\nnpm bin의 claude: ${claudeInBin.trim()}`;
        } catch (e) {
          debugInfo += "\nnpm bin 확인 실패";
        }
      }

      return {
        success: false,
        error: `Claude CLI 설치 후 실행에 실패했습니다.\n\n이는 일반적으로 다음과 같은 이유로 발생합니다:\n1. PATH 설정 문제\n2. 권한 문제\n3. 설치 위치 문제\n\n해결 방법:\n1. 새 터미널 창을 열고 'claude --help' 실행\n2. 성공하면 설치는 완료된 것입니다\n3. 여전히 안 되면 쉘 재시작 또는 시스템 재부팅\n\n오류: ${verifyError.message || verifyError}${debugInfo}`,
      };
    }
  } catch (error: any) {
    console.error("❌ Claude CLI 설치 실패:", error);

    let errorMessage = "Claude CLI 설치 중 오류가 발생했습니다.";

    if (error.code === "ENOENT") {
      errorMessage =
        "npm이 설치되어 있지 않습니다. Node.js와 npm을 먼저 설치해주세요.";
    } else if (error.code === "EACCES" || error.stderr?.includes("EACCES")) {
      errorMessage =
        "권한이 부족합니다. 비밀번호가 올바른지 확인하거나 다시 시도해주세요.";
    } else if (error.signal === "SIGTERM") {
      errorMessage =
        "설치가 타임아웃되었습니다. 네트워크 연결을 확인하고 다시 시도해주세요.";
    } else if (error.stderr) {
      // 상세한 오류 메시지 분류
      if (error.stderr.includes("sudo: command not found")) {
        errorMessage = "sudo 명령어를 찾을 수 없습니다.\n" +
          "이 시스템에서는 관리자 권한 없이 npm 패키지를 설치할 수 없을 수 있습니다.\n" +
          "Node.js를 사용자 권한으로 설치하거나 시스템 관리자에게 문의하세요.\n" +
          `상세 오류: ${error.stderr}`;
      } else if (error.stderr.includes("npm: command not found")) {
        errorMessage = "npm이 설치되어 있지 않거나 PATH에 등록되어 있지 않습니다.\n" +
          "Node.js를 설치하거나 ~/.bashrc 또는 ~/.zshrc에 npm 경로를 추가해주세요.\n" +
          `상세 오류: ${error.stderr}`;
      } else if (
        error.stderr.includes("Sorry, try again") ||
        error.stderr.includes("incorrect password")
      ) {
        errorMessage = "비밀번호가 올바르지 않습니다. 다시 시도해주세요.";
      } else if (error.stderr.includes("EACCES") || error.stderr.includes("permission denied")) {
        errorMessage = "권한이 부족합니다.\n" +
          "1. 비밀번호를 다시 확인해주세요.\n" +
          "2. 또는 Node.js를 사용자 디렉토리에 설치해보세요 (nvm, volta 등 사용).\n" +
          `상세 오류: ${error.stderr}`;
      } else {
        errorMessage = `설치 오류: ${error.stderr}\n명령어: ${command.replace(password, "****")}\n` +
          `오류 코드: ${error.code || '없음'}\n` +
          `시그널: ${error.signal || '없음'}`;
      }
    }

    return { success: false, error: errorMessage };
  }
});

// 파일 선택 대화상자
ipcMain.handle('select-file', async (_, options) => {
  const { dialog } = require("electron");
  try {
    const result = await dialog.showOpenDialog(options);
    if (!result.canceled && result.filePaths.length > 0) {
      return { filePath: result.filePaths[0] };
    }
    return null;
  } catch (error) {
    console.error('파일 선택 실패:', error);
    return null;
  }
});

// 저장 경로 선택 대화상자
ipcMain.handle('select-save-path', async (_, options) => {
  const { dialog } = require("electron");
  try {
    const result = await dialog.showSaveDialog(options);
    if (!result.canceled) {
      return { filePath: result.filePath };
    }
    return null;
  } catch (error) {
    console.error('저장 경로 선택 실패:', error);
    return null;
  }
});

// 스크립트 패키지 익스포트
ipcMain.handle('export-script-package', async (_, { scriptName, projectPath, savePath }) => {
  try {
    console.log(`🔥 [EXPORT DEBUG] 익스포트 시작:`, { scriptName, projectPath, savePath });

    // package.json 읽기
    const packageJsonPath = path.join(projectPath, 'package.json');
    console.log(`🔥 [EXPORT DEBUG] package.json 경로:`, packageJsonPath);

    if (!fs.existsSync(packageJsonPath)) {
      console.log(`🔥 [EXPORT DEBUG] package.json이 존재하지 않음`);
      return { success: false, error: 'package.json을 찾을 수 없습니다.' };
    }

    console.log(`🔥 [EXPORT DEBUG] package.json 읽기 중...`);
    const packageJsonContent = await fs.promises.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);

    console.log(`🔥 [EXPORT DEBUG] package.json 내용:`, { scripts: packageJson.scripts });

    if (!packageJson.scripts || !packageJson.scripts[scriptName]) {
      console.log(`🔥 [EXPORT DEBUG] 스크립트 "${scriptName}"를 찾을 수 없음`);
      return { success: false, error: `스크립트 "${scriptName}"를 package.json에서 찾을 수 없습니다.` };
    }

    console.log(`🔥 [EXPORT DEBUG] 스크립트 발견:`, { name: scriptName, command: packageJson.scripts[scriptName] });

    // 압축 파일 생성
    console.log(`🔥 [EXPORT DEBUG] 압축 파일 생성 시작:`, savePath);
    const output = fs.createWriteStream(savePath);
    console.log(`🔥 [EXPORT DEBUG] WriteStream 생성 완료`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    console.log(`🔥 [EXPORT DEBUG] Archiver 생성 완료`);

    return new Promise((resolve) => {
      output.on('close', () => {
        console.log(`🔥 [EXPORT DEBUG] ✅ 압축 파일 생성 완료: ${archive.pointer()} bytes`);
        resolve({ success: true });
      });

      output.on('error', (err: any) => {
        console.error('🔥 [EXPORT DEBUG] WriteStream 오류:', err);
        resolve({ success: false, error: `WriteStream 오류: ${err.message}` });
      });

      archive.on('error', (err: any) => {
        console.error('🔥 [EXPORT DEBUG] Archive 오류:', err);
        resolve({ success: false, error: `Archive 오류: ${err.message}` });
      });

      console.log(`🔥 [EXPORT DEBUG] Archive를 output에 연결 중...`);
      archive.pipe(output);

      // P-Desktop 메타데이터 추가
      console.log(`🔥 [EXPORT DEBUG] 메타데이터 생성 중...`);
      const metadata = {
        type: 'p-desktop-script-package',
        version: '1.0.0',
        scriptName: scriptName,
        command: packageJson.scripts[scriptName],
        exportedAt: new Date().toISOString(),
        projectName: packageJson.name || 'unknown'
      };

      console.log(`🔥 [EXPORT DEBUG] 메타데이터:`, metadata);
      archive.append(JSON.stringify(metadata, null, 2), { name: 'p-desktop-meta.json' });
      console.log(`🔥 [EXPORT DEBUG] 메타데이터 추가 완료`);

      // 스크립트 정보를 package.json 형식으로 추가
      console.log(`🔥 [EXPORT DEBUG] 스크립트 package.json 생성 중...`);
      const scriptPackageJson = {
        name: `${scriptName}-script`,
        version: packageJson.version || '1.0.0',
        scripts: {
          [scriptName]: packageJson.scripts[scriptName]
        }
      };

      console.log(`🔥 [EXPORT DEBUG] 스크립트 package.json:`, scriptPackageJson);
      archive.append(JSON.stringify(scriptPackageJson, null, 2), { name: 'package.json' });
      console.log(`🔥 [EXPORT DEBUG] 스크립트 package.json 추가 완료`);

      // 동일한 이름의 폴더가 있으면 추가
      const folderPath = path.join(projectPath, '코드', scriptName);
      console.log(`🔥 [EXPORT DEBUG] 폴더 경로 확인:`, folderPath, `존재함:`, fs.existsSync(folderPath));
      if (fs.existsSync(folderPath)) {
        console.log(`🔥 [EXPORT DEBUG] 📁 폴더 발견, 압축에 추가: ${folderPath}`);
        archive.directory(folderPath, `코드/${scriptName}`);
        console.log(`🔥 [EXPORT DEBUG] 📁 폴더 추가 완료`);
      } else {
        console.log(`🔥 [EXPORT DEBUG] 📁 해당 폴더 없음, 스킵`);
      }

      console.log(`🔥 [EXPORT DEBUG] Archive finalize 중...`);
      archive.finalize();
      console.log(`🔥 [EXPORT DEBUG] Archive finalize 완료`);
    });

  } catch (error: any) {
    console.error('🔥 [EXPORT DEBUG] 익스포트 중 예외 오류:', error);
    console.error('🔥 [EXPORT DEBUG] 오류 스택:', error.stack);
    return { success: false, error: `익스포트 예외: ${error.message}` };
  }
});

// 스크립트 패키지 임포트
ipcMain.handle('import-script-package', async (_, zipPath, projectPath) => {
  try {
    console.log(`📥 스크립트 패키지 임포트 시작:`, { zipPath, projectPath });

    // 임시 디렉토리 생성
    const tempDir = path.join(os.tmpdir(), `p-desktop-import-${Date.now()}`);
    await fs.promises.mkdir(tempDir, { recursive: true });

    try {
      // ZIP 파일 압축 해제
      await extractZip(zipPath, tempDir);

      // 메타데이터 검증
      const metaPath = path.join(tempDir, 'p-desktop-meta.json');
      if (!fs.existsSync(metaPath)) {
        return { success: false, error: 'P-Desktop 스크립트 패키지가 아닙니다. (메타데이터 없음)' };
      }

      const metadata = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8'));

      if (metadata.type !== 'p-desktop-script-package') {
        return { success: false, error: 'P-Desktop 스크립트 패키지가 아닙니다. (잘못된 타입)' };
      }

      // package.json 읽기
      const importPackageJsonPath = path.join(tempDir, 'package.json');
      if (!fs.existsSync(importPackageJsonPath)) {
        return { success: false, error: '패키지에 package.json이 없습니다.' };
      }

      const importPackageJson = JSON.parse(await fs.promises.readFile(importPackageJsonPath, 'utf-8'));
      const scriptName = Object.keys(importPackageJson.scripts)[0];
      const scriptCommand = importPackageJson.scripts[scriptName];

      if (!scriptName || !scriptCommand) {
        return { success: false, error: '패키지에서 스크립트를 찾을 수 없습니다.' };
      }

      // 현재 프로젝트의 package.json 업데이트
      const projectPackageJsonPath = path.join(projectPath, 'package.json');
      const projectPackageJson = JSON.parse(await fs.promises.readFile(projectPackageJsonPath, 'utf-8'));

      if (!projectPackageJson.scripts) {
        projectPackageJson.scripts = {};
      }

      // 중복 스크립트 확인
      if (projectPackageJson.scripts[scriptName]) {
        const overwrite = await new Promise((resolve) => {
          // 여기서는 단순히 덮어쓰기로 처리 (향후 개선 가능)
          resolve(true);
        });

        if (!overwrite) {
          return { success: false, error: '스크립트 임포트가 취소되었습니다.' };
        }
      }

      projectPackageJson.scripts[scriptName] = scriptCommand;
      await fs.promises.writeFile(projectPackageJsonPath, JSON.stringify(projectPackageJson, null, 2), 'utf-8');

      // 코드 폴더 복사 (있는 경우)
      let folderName = null;
      const codeFolderPath = path.join(tempDir, '코드', scriptName);
      if (fs.existsSync(codeFolderPath)) {
        const targetFolderPath = path.join(projectPath, '코드', scriptName);

        // 코드 디렉토리가 없으면 생성
        const codeDir = path.join(projectPath, '코드');
        if (!fs.existsSync(codeDir)) {
          await fs.promises.mkdir(codeDir, { recursive: true });
        }

        // 폴더 복사
        await copyDirectory(codeFolderPath, targetFolderPath);
        folderName = scriptName;
        console.log(`📁 폴더 복사 완료: ${targetFolderPath}`);
      }

      console.log(`✅ 스크립트 패키지 임포트 완료:`, { scriptName, folderName });

      return {
        success: true,
        scriptName: scriptName,
        folderName: folderName
      };

    } finally {
      // 임시 디렉토리 정리
      try {
        await fs.promises.rmdir(tempDir, { recursive: true });
      } catch (cleanupError) {
        console.warn('임시 디렉토리 정리 실패:', cleanupError);
      }
    }

  } catch (error: any) {
    console.error('임포트 중 오류:', error);
    return { success: false, error: error.message };
  }
});

// ZIP 압축 해제 유틸리티 함수
function extractZip(zipPath: string, extractPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        reject(err);
        return;
      }

      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName)) {
          // 디렉토리
          const dirPath = path.join(extractPath, entry.fileName);
          fs.mkdir(dirPath, { recursive: true }, (err) => {
            if (err) reject(err);
            else zipfile.readEntry();
          });
        } else {
          // 파일
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              reject(err);
              return;
            }

            const filePath = path.join(extractPath, entry.fileName);
            const dirPath = path.dirname(filePath);

            fs.mkdir(dirPath, { recursive: true }, (err) => {
              if (err) {
                reject(err);
                return;
              }

              const writeStream = fs.createWriteStream(filePath);
              readStream.pipe(writeStream);

              writeStream.on('close', () => {
                zipfile.readEntry();
              });

              writeStream.on('error', reject);
            });
          });
        }
      });

      zipfile.on('end', () => {
        resolve();
      });

      zipfile.on('error', reject);
    });
  });
}

// 디렉토리 복사 유틸리티 함수
async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.promises.mkdir(dest, { recursive: true });

  const entries = await fs.promises.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

// package.json 생성/확인 (npm install은 exec 탭에서 수행)
ipcMain.handle('ensure-package-json', async (_, projectPath) => {
  try {
    console.log(`🔄 [PACKAGE DEBUG] package.json 확인/생성 시작:`, projectPath);

    let message = '';

    // package.json 확인/생성
    const packageJsonPath = path.join(projectPath, 'package.json');
    console.log(`🔄 [PACKAGE DEBUG] package.json 경로:`, packageJsonPath);

    if (!fs.existsSync(packageJsonPath)) {
      console.log(`🔄 [PACKAGE DEBUG] package.json이 없음, 생성 중...`);

      const defaultPackageJson = {
        name: path.basename(projectPath).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        version: '1.0.0',
        description: '',
        main: 'index.js',
        scripts: {
          test: 'echo "Error: no test specified" && exit 1'
        },
        keywords: [],
        author: '',
        license: 'ISC'
      };

      await fs.promises.writeFile(
        packageJsonPath,
        JSON.stringify(defaultPackageJson, null, 2),
        'utf-8'
      );

      console.log(`🔄 [PACKAGE DEBUG] package.json 생성 완료`);
      message = '• package.json 생성됨';
    } else {
      console.log(`🔄 [PACKAGE DEBUG] package.json이 이미 존재함`);
      message = '• package.json 확인됨';
    }

    console.log(`🔄 [PACKAGE DEBUG] 처리 완료`);

    return {
      success: true,
      message: message
    };

  } catch (error: any) {
    console.error('🔄 [PACKAGE DEBUG] package.json 처리 중 오류:', error);

    return {
      success: false,
      error: `package.json 처리 실패: ${error.message}`
    };
  }
});
