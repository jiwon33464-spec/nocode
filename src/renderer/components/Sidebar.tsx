import React, { useState, useEffect } from "react";
import "../styles/sidebar.css";

interface FileItem {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  path?: string;
}

interface SidebarProps {
  files: FileItem[];
  currentPath: string;
  onFileSelect: (filePath: string) => void;
  onDirectoryChange: (path: string) => void;
  onScriptExecute: (scriptName: string) => void;
  onDoctorTabSwitch?: () => void;
  onTerminalTabSwitch?: () => void;
  onExecTabSwitch?: () => void;
  onClaudeCommandExecute?: (command: string) => Promise<boolean>;
}

interface ScriptItem {
  name: string;
  command: string;
}

const Sidebar: React.FC<SidebarProps> = ({
  files,
  currentPath,
  onFileSelect,
  onDirectoryChange,
  onScriptExecute,
  onDoctorTabSwitch,
  onTerminalTabSwitch,
  onExecTabSwitch,
  onClaudeCommandExecute,
}) => {
  const [activeTab, setActiveTab] = useState<"explorer" | "features">(
    "explorer"
  );
  const [expandedFolders, setExpandedFolders] = useState<
    Map<string, FileItem[]>
  >(new Map());
  const [scripts, setScripts] = useState<ScriptItem[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    item: FileItem | ScriptItem | null;
    type: "file" | "script";
  }>({ visible: false, x: 0, y: 0, item: null, type: "file" });
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [isRenamingFile, setIsRenamingFile] = useState(false);
  const [renamingFilePath, setRenamingFilePath] = useState<string>("");
  const [renameFileName, setRenameFileName] = useState("");
  const { ipcRenderer } = window.require("electron");

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      setContextMenu({ visible: false, x: 0, y: 0, item: null, type: "file" });

      // 파일 생성 입력 필드나 버튼을 클릭한 것이 아닌 경우에만 취소
      const target = e.target as HTMLElement;
      if (
        isCreatingFile &&
        !target.closest(".file-creation-inline") &&
        !target.closest(".create-file-btn")
      ) {
        if (!newFileName.trim()) {
          setIsCreatingFile(false);
          setNewFileName("");
        }
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [isCreatingFile, newFileName]);

  useEffect(() => {
    // Load npm scripts when Features tab is selected
    if (activeTab === "features") {
      loadNpmScripts();
    }
  }, [activeTab]);

  useEffect(() => {
    // 프롬프트 폴더가 있으면 자동으로 펼치기
    const autoExpandPromptFolder = async () => {
      const promptFolder = files.find(
        (file) => file.isDirectory && file.name === "프롬프트"
      );
      if (
        promptFolder &&
        promptFolder.path &&
        !expandedFolders.has(promptFolder.path)
      ) {
        await toggleFolder(promptFolder.path);
      }
    };

    if (files.length > 0) {
      autoExpandPromptFolder();
    }
  }, [files]);

  const loadNpmScripts = async () => {
    try {
      const content = await ipcRenderer.invoke(
        "fs-readfile",
        `${currentPath}/package.json`
      );
      const packageJson = JSON.parse(content);
      const scriptEntries = Object.entries(packageJson.scripts || {});
      const scriptItems: ScriptItem[] = scriptEntries.map(
        ([name, command]) => ({
          name,
          command: command as string,
        })
      );
      setScripts(scriptItems);
    } catch (error) {
      console.error("Failed to load package.json scripts:", error);
      setScripts([]);
    }
  };

  const handleContextMenu = (
    e: React.MouseEvent,
    item: FileItem | ScriptItem,
    type: "file" | "script" = "file"
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (type === "file" && (item as FileItem).isFile) {
      setContextMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        item: item,
        type: "file",
      });
    } else if (type === "script") {
      setContextMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        item: item,
        type: "script",
      });
    }
  };

  const handleScriptContextMenu = (e: React.MouseEvent, script: ScriptItem) => {
    handleContextMenu(e, script, "script");
  };

  const handleExecuteFile = async () => {
    if (
      contextMenu.item &&
      contextMenu.type === "file" &&
      (contextMenu.item as FileItem).path
    ) {
      try {
        const fileItem = contextMenu.item as FileItem;
        const filename = fileItem.name;
        const filePath = fileItem.path!;

        console.log(`🤖 Claude를 실행합니다: "${filename}"`);
        console.log(`📁 파일 경로: "${filePath}"`);
        console.log("─".repeat(50));

        // Claude CLI 설치 상태 확인
        const command = `claude --permission-mode bypassPermissions`;
        if (onClaudeCommandExecute) {
          const canExecute = await onClaudeCommandExecute(command);
          if (!canExecute) {
            console.log("❌ Claude CLI 설치가 필요합니다.");
            setContextMenu({
              visible: false,
              x: 0,
              y: 0,
              item: null,
              type: "file",
            });
            return;
          }
        }

        // Terminal 탭으로 전환
        if (onTerminalTabSwitch) {
          onTerminalTabSwitch();
        }

        // 프로젝트 루트 경로 가져오기
        const BASE_DIR = await ipcRenderer.invoke("get-default-path");

        // 파일명에서 확장자 제거 (폴더명으로 사용)
        const folderName = filename.replace(/\.[^/.]+$/, "");

        // 추가 지시사항을 임시 파일로 작성
        const tempInstructionPath = `${BASE_DIR}/.temp-claude-instruction.md`;
        const instructionContent = `${filename}를 읽고 프롬프트를 읽어서 코드를 만들어줘. 프로젝트 루트는 ${BASE_DIR} 입니다. 만들 코드는 루트의 코드폴더에 ${folderName} 폴더 내에 만들어줘. 코드를 다 작성하고 나면 package.json에 만든 코드를 실행할 수 있는 ${folderName} 이름과 동일한 명령어를 만들어줘.

추가적으로 프롬프트 내용에

## 구현 세부

- 코드 작성이 필요하다면 TypeScript 로 작성
- 코드가 필요하다면 Node 18 이상 환경에서 동작하는 코드
- 함수는 main() 하나로 작성 후 즉시 실행.
- 필요한 의존성이 있다면 설치
- 프로그램을 실행하면 open 모듈을 통해 포트를 실행한다.

## 수용 기준

- [ ] 파일 존재 및 형식 검사
- [ ] 로그 요약 출력
- [ ] SIGINT 안전 종료
- [ ] 에러 발생 시 메시지와 종료 코드

위 내용을 추가적으로 적용해줘.`;

        // 임시 지시사항 파일 생성
        await ipcRenderer.invoke("fs-writefile", tempInstructionPath, instructionContent);
        console.log(`✅ 임시 지시사항 파일 생성: ${tempInstructionPath}`);

        // Windows와 Unix/macOS 구분
        const isWindows = window.require('os').platform() === 'win32';

        let fullCommand: string;
        if (isWindows) {
          // Windows PowerShell: 한글 경로를 안전하게 처리
          // PowerShell에서는 && 대신 ; 사용
          // chcp 65001로 UTF-8 설정 후 claude 실행
          fullCommand = `chcp 65001 >$null; claude --permission-mode bypassPermissions "${tempInstructionPath}" "${filePath}"`;
        } else {
          // Unix/macOS: 작은따옴표로 경로 감싸기
          fullCommand = `claude --permission-mode bypassPermissions '${tempInstructionPath}' '${filePath}'`;
        }

        console.log(`실행 명령어 (Windows: ${isWindows}):`, fullCommand);

        // 터미널에 명령어 실행 - Terminal 탭에서 실행
        console.log(`📤 터미널에 명령어 전송 시도:`, {
          terminalId: "main-terminal",
          command: fullCommand,
        });

        // 기존 프로세스 중단 후 새 명령어 실행
        setTimeout(async () => {
          // Ctrl+C로 현재 실행 중인 프로세스 중단
          await ipcRenderer.invoke(
            "terminal-write",
            "main-terminal",
            "\x03" // Ctrl+C
          );

          console.log("✅ 기존 프로세스를 중단했습니다.");

          // 잠시 대기 후 새 명령어 실행
          setTimeout(async () => {
            await ipcRenderer.invoke(
              "terminal-write",
              "main-terminal",
              `${fullCommand}\r`
            );

            console.log("✅ Claude 명령어가 Terminal에 전송되었습니다.");
          }, 300);
        }, 100);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error("❌ Claude 실행 중 오류가 발생했습니다:", errorMessage);
        alert(
          "Claude 실행 중 오류가 발생했습니다. claude 명령어가 설치되어 있는지 확인해주세요."
        );
      }
    }

    // 컨텍스트 메뉴 닫기
    setContextMenu({ visible: false, x: 0, y: 0, item: null, type: "file" });
  };

  const handleEditFile = async () => {
    if (
      contextMenu.item &&
      contextMenu.type === "file" &&
      (contextMenu.item as FileItem).path
    ) {
      try {
        const fileItem = contextMenu.item as FileItem;
        const filename = fileItem.name;
        const filePath = fileItem.path!;

        console.log(`✏️ 파일 수정을 위해 Doctor를 실행합니다: "${filename}"`);
        console.log(`📁 파일 경로: "${filePath}"`);
        console.log("─".repeat(50));

        // Claude CLI 설치 상태 확인
        const command = `claude --permission-mode bypassPermissions`;
        if (onClaudeCommandExecute) {
          const canExecute = await onClaudeCommandExecute(command);
          if (!canExecute) {
            console.log("❌ Claude CLI 설치가 필요합니다.");
            setContextMenu({
              visible: false,
              x: 0,
              y: 0,
              item: null,
              type: "file",
            });
            return;
          }
        }

        // Doctor 탭으로 전환
        if (onDoctorTabSwitch) {
          onDoctorTabSwitch();
        }

        // 프로젝트 루트 경로 가져오기
        const BASE_DIR = await ipcRenderer.invoke("get-default-path");

        // 파일명에서 확장자 제거 (폴더명으로 사용)
        const folderName = filename.replace(/\.[^/.]+$/, "");

        // 추가 지시사항을 임시 파일로 작성
        const tempInstructionPath = `${BASE_DIR}/.temp-claude-edit-instruction.md`;
        const instructionContent = `${filename}프롬프트에 대해 수정 사항이 있어. 프로젝트 루트는 ${BASE_DIR} 입니다. 코드 폴더의 ${folderName} 폴더 내의 기능도 확인해줘.`;

        // 임시 지시사항 파일 생성
        await ipcRenderer.invoke("fs-writefile", tempInstructionPath, instructionContent);
        console.log(`✅ 임시 지시사항 파일 생성: ${tempInstructionPath}`);

        // Windows와 Unix/macOS 구분
        const isWindows = window.require('os').platform() === 'win32';

        let fullCommand: string;
        if (isWindows) {
          // Windows PowerShell: 한글 경로를 안전하게 처리
          // PowerShell에서는 && 대신 ; 사용
          fullCommand = `chcp 65001 >$null; claude --permission-mode bypassPermissions "${tempInstructionPath}" "${filePath}"`;
        } else {
          // Unix/macOS: 작은따옴표로 경로 감싸기
          fullCommand = `claude --permission-mode bypassPermissions '${tempInstructionPath}' '${filePath}'`;
        }

        console.log(`수정 명령어 (Windows: ${isWindows}):`, fullCommand);

        // Doctor 터미널에 명령어 전송
        console.log(`📤 Doctor 터미널에 명령어 전송 시도:`, {
          terminalId: "claude-terminal-1",
          command: fullCommand,
        });

        // 기존 프로세스 중단 후 새 명령어 실행
        setTimeout(async () => {
          // Ctrl+C로 현재 실행 중인 프로세스 중단
          await ipcRenderer.invoke(
            "terminal-write",
            "claude-terminal-1",
            "\x03" // Ctrl+C
          );

          console.log("✅ 기존 프로세스를 중단했습니다.");

          // 잠시 대기 후 새 명령어 실행
          setTimeout(async () => {
            await ipcRenderer.invoke(
              "terminal-write",
              "claude-terminal-1",
              `${fullCommand}\r`
            );

            console.log("✅ 수정 명령어가 Doctor 터미널에 전송되었습니다.");
          }, 300);
        }, 100);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error("❌ 파일 수정 중 오류가 발생했습니다:", errorMessage);
        alert(
          "파일 수정 중 오류가 발생했습니다. claude 명령어가 설치되어 있는지 확인해주세요."
        );
      }
    }

    // 컨텍스트 메뉴 닫기
    setContextMenu({ visible: false, x: 0, y: 0, item: null, type: "file" });
  };

  const handleExecuteScript = async () => {
    if (contextMenu.item && contextMenu.type === "script") {
      try {
        const script = contextMenu.item as ScriptItem;
        console.log("스크립트 실행:", script.name);

        // Exec 탭으로 전환
        if (onExecTabSwitch) {
          onExecTabSwitch();
        }

        // 스크립트 실행
        onScriptExecute(script.name);

        // Ctrl+C로 현재 실행 중인 프로세스만 중단
        await ipcRenderer.invoke(
          "terminal-write",
          "exec-terminal",
          "\x03" // Ctrl+C
        );

        console.log("✅ 기존 프로세스를 중단했습니다.");

        // 잠시 대기 후 새 명령어 실행
        setTimeout(async () => {
          try {
            const command = `npm run ${script.name}`;
            console.log(`실행 명령어: ${command}`);

            // Exec 터미널에 명령어 실행
            await ipcRenderer.invoke(
              "terminal-write",
              "exec-terminal",
              `${command}\r`
            );

            console.log("✅ npm 스크립트가 Exec 터미널에 전송되었습니다.");
          } catch (error) {
            console.error("명령어 실행 실패:", error);
          }
        }, 300);
      } catch (error) {
        console.error("스크립트 실행 실패:", error);
      }
    }
    setContextMenu({ visible: false, x: 0, y: 0, item: null, type: "file" });
  };

  const handleRenameFile = () => {
    if (
      contextMenu.item &&
      contextMenu.type === "file" &&
      (contextMenu.item as FileItem).path
    ) {
      const fileItem = contextMenu.item as FileItem;
      // 확장자 분리
      const fileName = fileItem.name;
      const lastDotIndex = fileName.lastIndexOf(".");
      const nameWithoutExtension =
        lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;

      setRenamingFilePath(fileItem.path!);
      setRenameFileName(nameWithoutExtension); // 확장자 제외한 이름만 설정
      setIsRenamingFile(true);
    }
    setContextMenu({ visible: false, x: 0, y: 0, item: null, type: "file" });
  };

  const handleDeleteFile = async () => {
    if (
      contextMenu.item &&
      contextMenu.type === "file" &&
      (contextMenu.item as FileItem).path
    ) {
      const fileItem = contextMenu.item as FileItem;
      const confirmDelete = window.confirm(
        `"${fileItem.name}" 파일을 삭제하시겠습니까?`
      );

      if (confirmDelete) {
        try {
          await ipcRenderer.invoke("fs-deletefile", fileItem.path);
          console.log("파일 삭제됨:", fileItem.path);

          // 프롬프트 폴더 새로고침
          await refreshPromptFolder();

          // 전체 디렉토리 새로고침
          onDirectoryChange(currentPath);
        } catch (error) {
          console.error("파일 삭제 실패:", error);
          alert("파일 삭제에 실패했습니다.");
        }
      }
    }
    setContextMenu({ visible: false, x: 0, y: 0, item: null, type: "file" });
  };

  const handleDeleteScript = async () => {
    if (contextMenu.item && contextMenu.type === "script") {
      const scriptItem = contextMenu.item as ScriptItem;
      const confirmDelete = window.confirm(
        `"${scriptItem.name}" 스크립트를 삭제하시겠습니까?\n\n동일한 이름의 폴더나 파일이 있다면 함께 삭제됩니다.`
      );

      if (confirmDelete) {
        try {
          // package.json에서 스크립트 삭제
          await ipcRenderer.invoke("delete-script", scriptItem.name);
          console.log("스크립트 삭제됨:", scriptItem.name);

          // 동일한 이름의 폴더/파일 검색 및 삭제
          await deleteMatchingFolderOrFile(scriptItem.name);

          // 스크립트 목록 새로고침
          loadNpmScripts();

          // 전체 디렉토리 새로고침
          onDirectoryChange(currentPath);
        } catch (error) {
          console.error("스크립트 삭제 실패:", error);
          alert("스크립트 삭제에 실패했습니다.");
        }
      }
    }
    setContextMenu({ visible: false, x: 0, y: 0, item: null, type: "script" });
  };

  const handleFixScript = async () => {
    if (contextMenu.item && contextMenu.type === "script") {
      try {
        const scriptItem = contextMenu.item as ScriptItem;
        const scriptName = scriptItem.name;

        console.log(
          `🔧 스크립트 수정을 위해 Claude를 실행합니다: "${scriptName}"`
        );
        console.log("─".repeat(50));

        // Claude CLI 설치 상태 확인
        const command = `claude --permission-mode bypassPermissions`;
        if (onClaudeCommandExecute) {
          const canExecute = await onClaudeCommandExecute(command);
          if (!canExecute) {
            console.log("❌ Claude CLI 설치가 필요합니다.");
            setContextMenu({
              visible: false,
              x: 0,
              y: 0,
              item: null,
              type: "script",
            });
            return;
          }
        }

        // Doctor 탭으로 전환
        if (onDoctorTabSwitch) {
          onDoctorTabSwitch();
        }

        // 프로젝트 루트 경로 가져오기
        const BASE_DIR = await ipcRenderer.invoke("get-default-path");

        // 추가 지시사항을 임시 파일로 작성
        const tempInstructionPath = `${BASE_DIR}/.temp-claude-fix-instruction.md`;
        const instructionContent = `${scriptName}명령어 및 코드에 대해 수정 사항이 있어. 프로젝트 루트는 ${BASE_DIR} 입니다. ${scriptName}명령어를 먼저 실행해보고, 코드 폴더의 ${scriptName} 폴더 내의 기능에 문제가 있다면 고쳐줘.`;

        // 임시 지시사항 파일 생성
        await ipcRenderer.invoke("fs-writefile", tempInstructionPath, instructionContent);
        console.log(`✅ 임시 지시사항 파일 생성: ${tempInstructionPath}`);

        // Windows와 Unix/macOS 구분
        const isWindows = window.require('os').platform() === 'win32';

        let fullCommand: string;
        if (isWindows) {
          // Windows PowerShell: 한글 경로를 안전하게 처리
          // PowerShell에서는 && 대신 ; 사용
          fullCommand = `chcp 65001 >$null; claude --permission-mode bypassPermissions "${tempInstructionPath}"`;
        } else {
          // Unix/macOS: 작은따옴표로 경로 감싸기
          fullCommand = `claude --permission-mode bypassPermissions '${tempInstructionPath}'`;
        }

        console.log(`수정 명령어 (Windows: ${isWindows}):`, fullCommand);

        // Doctor 터미널에 명령어 전송
        console.log(`📤 Doctor 터미널에 명령어 전송 시도:`, {
          terminalId: "claude-terminal-1",
          command: fullCommand,
        });

        // 기존 프로세스 중단 후 새 명령어 실행
        setTimeout(async () => {
          // Ctrl+C로 현재 실행 중인 프로세스 중단
          await ipcRenderer.invoke(
            "terminal-write",
            "claude-terminal-1",
            "\x03" // Ctrl+C
          );

          console.log("✅ 기존 프로세스를 중단했습니다.");

          // 잠시 대기 후 새 명령어 실행
          setTimeout(async () => {
            await ipcRenderer.invoke(
              "terminal-write",
              "claude-terminal-1",
              `${fullCommand}\r`
            );

            console.log(
              "✅ 스크립트 수정 명령어가 Doctor 터미널에 전송되었습니다."
            );
          }, 300);
        }, 100);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error("❌ 스크립트 수정 중 오류가 발생했습니다:", errorMessage);
        alert(
          "스크립트 수정 중 오류가 발생했습니다. claude 명령어가 설치되어 있는지 확인해주세요."
        );
      }
    }

    // 컨텍스트 메뉴 닫기
    setContextMenu({ visible: false, x: 0, y: 0, item: null, type: "script" });
  };

  const deleteMatchingFolderOrFile = async (scriptName: string) => {
    try {
      // 현재 경로에서 동일한 이름의 폴더나 파일 검색
      const items = await ipcRenderer.invoke("fs-readdir", currentPath);
      const matchingItem = items.find(
        (item: FileItem) => item.name === scriptName
      );

      if (matchingItem) {
        const itemPath = `${currentPath}/${matchingItem.name}`;
        if (matchingItem.isDirectory) {
          // 폴더 삭제
          await ipcRenderer.invoke("fs-deletefolder", itemPath);
          console.log("폴더 삭제됨:", itemPath);
        } else {
          // 파일 삭제
          await ipcRenderer.invoke("fs-deletefile", itemPath);
          console.log("파일 삭제됨:", itemPath);
        }
      }
    } catch (error) {
      console.error("동일한 이름의 폴더/파일 삭제 실패:", error);
      // 에러가 발생해도 스크립트 삭제는 계속 진행
    }
  };

  const refreshPromptFolder = async () => {
    try {
      const promptFolderPath = `${currentPath}/프롬프트`;
      if (expandedFolders.has(promptFolderPath)) {
        const promptFolderFiles = await ipcRenderer.invoke(
          "fs-readdir",
          promptFolderPath
        );
        const filesWithPath = promptFolderFiles.map((file: FileItem) => ({
          ...file,
          path: `${promptFolderPath}/${file.name}`,
        }));

        const newExpanded = new Map(expandedFolders);
        newExpanded.set(promptFolderPath, filesWithPath);
        setExpandedFolders(newExpanded);
      }
    } catch (error) {
      console.error("프롬프트 폴더 새로고침 실패:", error);
    }
  };

  const filterFiles = (files: FileItem[]) => {
    return files.filter((file) => {
      if (file.isFile) {
        // 파일은 표시하지 않음
        return false;
      } else {
        // 폴더는 "프롬프트" 폴더만 표시
        return file.name === "프롬프트";
      }
    });
  };

  const toggleFolder = async (folderPath: string) => {
    const newExpanded = new Map(expandedFolders);

    if (newExpanded.has(folderPath)) {
      // 폴더가 이미 펼쳐져 있으면 접기
      newExpanded.delete(folderPath);
    } else {
      // 폴더가 접혀있으면 펼치기 - 폴더 내용 로드
      try {
        const dirFiles = await ipcRenderer.invoke("fs-readdir", folderPath);
        const filesWithPath = dirFiles.map((file: FileItem) => ({
          ...file,
          path: `${folderPath}/${file.name}`,
        }));
        // 프롬프트 폴더 내부에서는 모든 파일을 표시
        const filteredFiles = filesWithPath;
        newExpanded.set(folderPath, filteredFiles);
      } catch (error) {
        console.error("폴더 읽기 실패:", error);
        return;
      }
    }

    setExpandedFolders(newExpanded);
  };

  const handleItemClick = (item: FileItem) => {
    if (item.isDirectory) {
      toggleFolder(item.path!);
    } else {
      onFileSelect(item.path!);
    }
  };

  const getFileIcon = (item: FileItem) => {
    if (item.isDirectory) {
      return expandedFolders.has(item.path!) ? "📂" : "📁";
    }
    const ext = item.name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "js":
      case "jsx":
      case "ts":
      case "tsx":
        return "📜";
      case "css":
        return "🎨";
      case "html":
        return "🌐";
      case "json":
        return "📋";
      case "md":
        return "📝";
      default:
        return "📄";
    }
  };

  const selectFolder = async () => {
    try {
      const { ipcRenderer } = window.require("electron");
      const selectedPath = await ipcRenderer.invoke("select-directory");
      if (selectedPath) {
        onDirectoryChange(selectedPath);
      }
    } catch (error) {
      console.error("폴더 선택 실패:", error);
    }
  };

  const handleCreateFile = () => {
    console.log("📄 새 파일 버튼 클릭됨!");
    console.log("현재 isCreatingFile 상태:", isCreatingFile);
    setIsCreatingFile(true);
    console.log("isCreatingFile을 true로 설정함");
  };

  const handleFileNameSubmit = async (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (newFileName.trim()) {
        try {
          // 파일명에 .md 확장자가 없으면 추가
          let fileName = newFileName.trim();
          if (!fileName.endsWith(".md")) {
            fileName = fileName + ".md";
          }

          // 프롬프트 폴더에 파일 생성
          const promptFolderPath = `${currentPath}/프롬프트`;
          const filePath = `${promptFolderPath}/${fileName}`;

          await ipcRenderer.invoke("fs-writefile", filePath, "");
          console.log("파일 생성됨:", filePath);

          // 프롬프트 폴더 내용을 즉시 새로고침
          const promptFolderFiles = await ipcRenderer.invoke(
            "fs-readdir",
            promptFolderPath
          );
          const filesWithPath = promptFolderFiles.map((file: FileItem) => ({
            ...file,
            path: `${promptFolderPath}/${file.name}`,
          }));

          // expandedFolders 상태 업데이트
          const newExpanded = new Map(expandedFolders);
          newExpanded.set(promptFolderPath, filesWithPath);
          setExpandedFolders(newExpanded);

          // 전체 디렉토리도 새로고침
          onDirectoryChange(currentPath);
        } catch (error) {
          console.error("파일 생성 실패:", error);
        }
      }
      setIsCreatingFile(false);
      setNewFileName("");
    } else if (e.key === "Escape") {
      setIsCreatingFile(false);
      setNewFileName("");
    }
  };

  const handleRenameSubmit = async (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (renameFileName.trim() && renamingFilePath) {
        try {
          const oldPath = renamingFilePath;
          const directory = oldPath.substring(0, oldPath.lastIndexOf("/"));

          // 기존 파일의 확장자 추출
          const oldFileName = oldPath.substring(oldPath.lastIndexOf("/") + 1);
          const lastDotIndex = oldFileName.lastIndexOf(".");
          const extension =
            lastDotIndex > 0 ? oldFileName.substring(lastDotIndex) : "";

          // 새 파일명에 기존 확장자 붙이기
          const newPath = `${directory}/${renameFileName.trim()}${extension}`;

          // 파일 이름변경 (기존 파일을 읽고 새 파일로 복사한 후 기존 파일 삭제)
          const content = await ipcRenderer.invoke("fs-readfile", oldPath);
          await ipcRenderer.invoke("fs-writefile", newPath, content);
          await ipcRenderer.invoke("fs-deletefile", oldPath);

          console.log("파일 이름변경됨:", oldPath, "->", newPath);

          // 프롬프트 폴더 새로고침
          await refreshPromptFolder();

          // 전체 디렉토리 새로고침
          onDirectoryChange(currentPath);
        } catch (error) {
          console.error("파일 이름변경 실패:", error);
          alert("파일 이름변경에 실패했습니다.");
        }
      }
      setIsRenamingFile(false);
      setRenamingFilePath("");
      setRenameFileName("");
    } else if (e.key === "Escape") {
      setIsRenamingFile(false);
      setRenamingFilePath("");
      setRenameFileName("");
    }
  };

  const renderFileTree = (items: FileItem[], depth: number = 0) => {
    console.log(
      `renderFileTree 호출됨 - depth: ${depth}, isCreatingFile: ${isCreatingFile}`
    );
    const result: React.ReactNode[] = [];

    items.forEach((item, index) => {
      const isRenaming = isRenamingFile && item.path === renamingFilePath;

      result.push(
        <div key={index}>
          <div
            className={`file-item ${item.isDirectory ? "directory" : "file"} ${
              isRenaming ? "renaming" : ""
            }`}
            style={{ paddingLeft: `${depth * 20 + 8}px` }}
            onClick={() => !isRenaming && handleItemClick(item)}
            onContextMenu={(e) =>
              !isRenaming && handleContextMenu(e, item, "file")
            }
          >
            <span className="file-icon">{getFileIcon(item)}</span>
            {isRenaming ? (
              <div className="rename-container">
                <input
                  type="text"
                  value={renameFileName}
                  onChange={(e) => setRenameFileName(e.target.value)}
                  onKeyDown={handleRenameSubmit}
                  autoFocus
                  className="inline-file-input"
                />
                <span className="file-extension">
                  {(() => {
                    const lastDotIndex = item.name.lastIndexOf(".");
                    return lastDotIndex > 0
                      ? item.name.substring(lastDotIndex)
                      : "";
                  })()}
                </span>
              </div>
            ) : (
              <span className="file-name">{item.name}</span>
            )}
          </div>
          {item.isDirectory && expandedFolders.has(item.path!) && (
            <div className="nested-files">
              {renderFileTree(expandedFolders.get(item.path!)!, depth + 1)}
            </div>
          )}
        </div>
      );
    });

    // 파일 생성 UI를 마지막에 추가
    if (depth === 0 && isCreatingFile) {
      console.log("✅ 파일 생성 UI를 추가합니다!");
      result.push(
        <div key="file-creation" className="file-creation-inline">
          <div className="file-item creating" style={{ paddingLeft: "8px" }}>
            <span className="file-icon">📄</span>
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={handleFileNameSubmit}
              placeholder="파일명 입력... (.md 자동추가)"
              autoFocus
              className="inline-file-input"
            />
          </div>
          <div className="creation-hint">Enter: 생성 | Esc: 취소</div>
        </div>
      );
    } else if (depth === 0) {
      console.log(
        "❌ 파일 생성 UI가 추가되지 않음 - isCreatingFile:",
        isCreatingFile
      );
    }

    console.log(`renderFileTree 결과 - ${result.length}개 아이템 반환`);
    return result;
  };

  const handleImportScript = async () => {
    try {
      const result = await ipcRenderer.invoke("select-file", {
        filters: [{ name: "P-Desktop Script Package", extensions: ["zip"] }],
        properties: ["openFile"],
      });

      if (result && result.filePath) {
        console.log("📥 압축파일 선택됨:", result.filePath);

        // 압축파일 임포트 처리
        const importResult = await ipcRenderer.invoke(
          "import-script-package",
          result.filePath,
          currentPath
        );

        if (importResult.success) {
          alert(
            `✅ 스크립트 패키지 임포트 완료!\n\n추가된 스크립트: ${
              importResult.scriptName
            }\n추가된 폴더: ${importResult.folderName || "없음"}`
          );

          // 스크립트 목록과 디렉토리 새로고침
          loadNpmScripts();
          onDirectoryChange(currentPath);
        } else {
          alert(`❌ 임포트 실패:\n${importResult.error}`);
        }
      }
    } catch (error) {
      console.error("임포트 중 오류:", error);
      alert("임포트 중 오류가 발생했습니다.");
    }
  };

  const handleSyncProject = async () => {
    try {
      console.log(`🔄 [SYNC DEBUG] Sync 버튼 클릭됨`);

      // 사용자 확인
      const confirmed = window.confirm(
        "프로젝트를 동기화하시겠습니까?\n\n다음 작업이 수행됩니다:\n• package.json 생성/확인\n• Claude로 코드 폴더 분석 및 의존성 설치\n• npm install 실행"
      );

      if (!confirmed) {
        console.log(`🔄 [SYNC DEBUG] 사용자가 취소함`);
        return;
      }

      console.log(`🔄 [SYNC DEBUG] package.json 생성 시작`);

      // 1. package.json 생성 (백그라운드)
      const packageResult = await ipcRenderer.invoke(
        "ensure-package-json",
        currentPath
      );

      if (!packageResult.success) {
        alert(`❌ package.json 생성 실패:\n${packageResult.error}`);
        return;
      }

      console.log(
        `🔄 [SYNC DEBUG] package.json 처리 완료:`,
        packageResult.message
      );

      // 2. Exec 탭으로 전환
      if (onExecTabSwitch) {
        onExecTabSwitch();
      }

      // 3. exec 탭에서 Claude 의존성 분석 실행
      console.log(`🔄 [SYNC DEBUG] exec 탭에서 Claude 의존성 분석 실행`);

      // 기존 프로세스 중단 후 새 명령어 실행
      setTimeout(async () => {
        // Ctrl+C로 현재 실행 중인 프로세스 중단
        await ipcRenderer.invoke("terminal-write", "exec-terminal", "\x03");

        console.log("✅ 기존 프로세스를 중단했습니다.");

        // 잠시 대기 후 Claude 명령어 실행
        setTimeout(async () => {
          try {
            // 1단계: Claude로 의존성 분석 및 설치
            const promptForSync = "코드 폴더내의 프로젝트들을 읽고 난후에, 필요한 의존성을 전부 설치해줘. 그밖에 동작은 일체 하면 안돼.";

            // 프로젝트 루트 경로 가져오기
            const BASE_DIR = await ipcRenderer.invoke("get-default-path");

            // 추가 지시사항을 임시 파일로 작성
            const tempSyncInstructionPath = `${BASE_DIR}/.temp-claude-sync-instruction.md`;
            await ipcRenderer.invoke("fs-writefile", tempSyncInstructionPath, promptForSync);
            console.log(`✅ 동기화 임시 지시사항 파일 생성: ${tempSyncInstructionPath}`);

            // Windows에서 안전한 명령어 실행을 위한 처리
            const isWindows = window.require('os').platform() === 'win32';

            let claudeCommand: string;
            if (isWindows) {
              // Windows PowerShell: 한글 경로를 안전하게 처리
              // PowerShell에서는 && 대신 ; 사용
              claudeCommand = `chcp 65001 >$null; claude --permission-mode bypassPermissions "${tempSyncInstructionPath}"`;
            } else {
              // Unix/macOS: 작은따옴표로 경로 감싸기
              claudeCommand = `claude --permission-mode bypassPermissions '${tempSyncInstructionPath}'`;
            }
            console.log(`🔄 [SYNC DEBUG] Claude 명령어 실행:`, claudeCommand);

            await ipcRenderer.invoke(
              "terminal-write",
              "exec-terminal",
              `${claudeCommand}\r`
            );

            console.log(
              "✅ Claude 의존성 분석 명령어가 exec 터미널에 전송되었습니다."
            );

            // 2단계: Claude 작업 완료 후 npm install 실행 (30초 후)
            setTimeout(async () => {
              try {
                console.log(`🔄 [SYNC DEBUG] npm install 실행`);

                // 새 줄 추가 후 npm install
                await ipcRenderer.invoke(
                  "terminal-write",
                  "exec-terminal",
                  "\r\n"
                );
                const npmCommand = `npm install`;
                await ipcRenderer.invoke(
                  "terminal-write",
                  "exec-terminal",
                  `${npmCommand}\r`
                );

                console.log(
                  "✅ npm install 명령어가 exec 터미널에 전송되었습니다."
                );

                // 스크립트 목록과 디렉토리 새로고침 (npm install 완료 대기: 10초 후)
                setTimeout(() => {
                  loadNpmScripts();
                  onDirectoryChange(currentPath);
                }, 10000);
              } catch (error) {
                console.error("npm install 실행 실패:", error);
              }
            }, 30000); // Claude 작업 완료를 위해 30초 대기

            // 성공 메시지
            alert(
              `✅ 프로젝트 동기화 시작!\n\n${packageResult.message}\n• Claude가 코드 분석 및 의존성 설치 중\n• 30초 후 npm install 자동 실행`
            );
          } catch (error) {
            console.error("동기화 실행 실패:", error);
            alert("동기화 실행 중 오류가 발생했습니다.");
          }
        }, 300); // Claude 명령어 실행을 위한 setTimeout 닫기
      }, 100); // 프로세스 중단을 위한 setTimeout 닫기
    } catch (error) {
      console.error("동기화 중 오류:", error);
      alert("동기화 중 오류가 발생했습니다.");
    }
  };

  const handleExportSingleScript = async (scriptName: string) => {
    try {
      console.log(`🔥 [UI DEBUG] 개별 Export 버튼 클릭됨:`, scriptName);

      // 저장 위치 선택
      const result = await ipcRenderer.invoke("select-save-path", {
        defaultPath: `${scriptName}-script-package.zip`,
        filters: [{ name: "P-Desktop Script Package", extensions: ["zip"] }],
      });

      if (result && result.filePath) {
        console.log(`🔥 [UI DEBUG] 개별 익스포트 IPC 호출:`, {
          scriptName,
          projectPath: currentPath,
          savePath: result.filePath,
        });

        const exportResult = await ipcRenderer.invoke("export-script-package", {
          scriptName: scriptName,
          projectPath: currentPath,
          savePath: result.filePath,
        });

        console.log(`🔥 [UI DEBUG] 개별 익스포트 IPC 응답:`, exportResult);

        if (exportResult.success) {
          alert(
            `✅ "${scriptName}" 스크립트 패키지 익스포트 완료!\n\n저장 위치: ${result.filePath}`
          );
        } else {
          alert(`❌ "${scriptName}" 익스포트 실패:\n${exportResult.error}`);
        }
      }
    } catch (error) {
      console.error(`개별 익스포트 중 오류 (${scriptName}):`, error);
      alert(`"${scriptName}" 익스포트 중 오류가 발생했습니다.`);
    }
  };

  const renderScriptList = () => {
    return scripts.map((script, index) => (
      <div key={index} className="script-item-container">
        <div
          className="script-item"
          onContextMenu={(e) => handleScriptContextMenu(e, script)}
        >
          <span className="script-icon">⚙️</span>
          <div className="script-content">
            <span className="script-name">{script.name}</span>
            <span className="script-command">{script.command}</span>
          </div>
          <button
            className="script-export-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleExportSingleScript(script.name);
            }}
            title={`"${script.name}" 스크립트 익스포트`}
          >
            📤
          </button>
        </div>
      </div>
    ));
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab ${
              activeTab === "explorer" ? "active" : ""
            }`}
            onClick={() => setActiveTab("explorer")}
          >
            📁 탐색기
          </button>
          <button
            className={`sidebar-tab ${
              activeTab === "features" ? "active" : ""
            }`}
            onClick={() => setActiveTab("features")}
          >
            ⚙️ 기능
          </button>
        </div>

        {activeTab === "explorer" && (
          <div className="path-nav">
            <div className="nav-buttons">
              <button onClick={selectFolder} className="select-folder-btn">
                📁 폴더 선택
              </button>
            </div>
            <div className="current-path" title={currentPath}>
              📍 {currentPath.split("/").pop() || currentPath}
            </div>
            <div className="full-path" title={currentPath}>
              {currentPath}
            </div>
            <div className="file-actions">
              <button onClick={handleCreateFile} className="create-file-btn">
                📄 새 파일 {isCreatingFile ? "(활성화됨)" : "(비활성화됨)"}
              </button>
            </div>
          </div>
        )}

        {activeTab === "features" && (
          <div className="features-header">
            <h4>Package Scripts</h4>
            <p>package.json의 scripts 목록</p>
            <div className="import-export-buttons">
              <button onClick={handleImportScript} className="import-btn">
                📥 Import
              </button>
              <button onClick={handleSyncProject} className="sync-btn">
                🔄 Sync
              </button>
              <div className="export-info">
                📤 각 스크립트 옆 버튼으로 익스포트
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-content">
        {activeTab === "explorer" ? (
          <div className="file-list">{renderFileTree(filterFiles(files))}</div>
        ) : (
          <div className="script-list">
            {scripts.length === 0 ? (
              <div className="empty-message">
                <p>사용 가능한 스크립트가 없습니다.</p>
                <p>package.json을 확인해주세요.</p>
              </div>
            ) : (
              renderScriptList()
            )}
          </div>
        )}
      </div>

      {contextMenu.visible && (
        <div
          className="context-menu"
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === "file" ? (
            <>
              <div className="context-menu-item" onClick={handleExecuteFile}>
                ▶️ 실행
              </div>
              <div className="context-menu-item" onClick={handleEditFile}>
                🩺 수정
              </div>
              <div className="context-menu-item" onClick={handleRenameFile}>
                ✏️ 이름변경
              </div>
              <div
                className="context-menu-item delete"
                onClick={handleDeleteFile}
              >
                🗑️ 삭제
              </div>
            </>
          ) : (
            <>
              <div className="context-menu-item" onClick={handleExecuteScript}>
                ▶️ 실행
              </div>
              <div className="context-menu-item" onClick={handleFixScript}>
                🔧 고치기
              </div>
              <div
                className="context-menu-item delete"
                onClick={handleDeleteScript}
              >
                🗑️ 삭제
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Sidebar;
