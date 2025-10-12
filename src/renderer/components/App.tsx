import React, { useState, useEffect, useRef } from "react";
import Sidebar from "./Sidebar";
import Editor from "./Editor";
import Terminal from "./Terminal";
import Resizer from "./Resizer";
import ClaudeInstaller from "./ClaudeInstaller";

const { ipcRenderer } = window.require("electron");

interface FileItem {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  path?: string;
}

const App: React.FC = () => {
  console.log("=== APP COMPONENT RENDERED ===");

  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [currentPath, setCurrentPath] = useState<string>("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [terminalHeight, setTerminalHeight] = useState(300);
  const [showTerminal, setShowTerminal] = useState<boolean>(true);
  const [showClaudeInstaller, setShowClaudeInstaller] = useState<boolean>(false);
  const [isClaudeInstalled, setIsClaudeInstalled] = useState<boolean>(false);
  const editorRef = useRef<any>(null);

  useEffect(() => {
    // 기본 경로 설정
    ipcRenderer.invoke("get-default-path").then((defaultPath: string) => {
      setCurrentPath(defaultPath);
      loadDirectory(defaultPath);
    });

    // Claude CLI 설치 상태 확인
    checkClaudeInstallation();

    // 창 종료 시 저장 확인
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (editorRef.current?.isModified) {
        e.preventDefault();
        e.returnValue = '저장하지 않은 변경사항이 있습니다. 정말로 나가시겠습니까?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const loadDirectory = async (dirPath: string) => {
    try {
      const dirFiles = await ipcRenderer.invoke("fs-readdir", dirPath);
      const filesWithPath = dirFiles.map((file: FileItem) => ({
        ...file,
        path: `${dirPath}/${file.name}`,
      }));
      setFiles(filesWithPath);
    } catch (error) {
      console.error("디렉토리 로딩 실패:", error);
    }
  };

  const openFile = async (filePath: string) => {
    try {
      // 현재 파일에 저장되지 않은 변경사항이 있는지 확인
      if (editorRef.current?.checkUnsavedChanges) {
        const canProceed = await editorRef.current.checkUnsavedChanges();
        if (!canProceed) {
          return; // 사용자가 취소하면 파일 열기 중단
        }
      }

      const content = await ipcRenderer.invoke("fs-readfile", filePath);
      setCurrentFile(filePath);
      setFileContent(content);
    } catch (error) {
      console.error("파일 열기 실패:", error);
    }
  };

  const handleFileChangeRequest = async (currentFilePath: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const result = window.confirm(
        `"${currentFilePath.split('/').pop()}" 파일에 저장되지 않은 변경사항이 있습니다.\n\n저장하시겠습니까?`
      );

      if (result) {
        // 저장 후 계속 진행
        saveFile(editorRef.current?.getContent?.() || '');
        resolve(true);
      } else {
        // 저장하지 않고 계속 진행
        const discardResult = window.confirm(
          "변경사항을 저장하지 않고 계속하시겠습니까?\n\n저장되지 않은 내용은 모두 삭제됩니다."
        );
        resolve(discardResult);
      }
    });
  };

  const saveFile = async (content: string) => {
    if (!currentFile) return;
    try {
      await ipcRenderer.invoke("fs-writefile", currentFile, content);
      setFileContent(content);
    } catch (error) {
      console.error("파일 저장 실패:", error);
    }
  };

  const executeScript = (scriptName: string) => {
    console.log(`📋 스크립트 실행 요청: ${scriptName}`);
    // Terminal 컴포넌트 내부의 executeScript가 처리함
  };

  const checkClaudeInstallation = async () => {
    try {
      const isInstalled = await ipcRenderer.invoke('check-claude-cli');
      setIsClaudeInstalled(isInstalled);

      if (!isInstalled) {
        // Claude CLI가 설치되지 않았으면 설치 모달 표시
        setShowClaudeInstaller(true);
      }
    } catch (error) {
      console.error('Claude CLI 확인 중 오류:', error);
      // 확인 실패 시에도 설치 모달 표시
      setShowClaudeInstaller(true);
    }
  };

  const handleClaudeInstallComplete = () => {
    setShowClaudeInstaller(false);
    setIsClaudeInstalled(true);
    console.log('✅ Claude CLI 설치가 완료되었습니다!');
  };

  const handleClaudeInstallCancel = () => {
    setShowClaudeInstaller(false);
    console.log('❌ Claude CLI 설치가 취소되었습니다.');
  };

  const executeClaudeCommand = async (command: string) => {
    // Claude CLI 실행 전 설치 상태 재확인
    if (!isClaudeInstalled) {
      const isInstalled = await ipcRenderer.invoke('check-claude-cli');
      if (!isInstalled) {
        setShowClaudeInstaller(true);
        return false;
      }
      setIsClaudeInstalled(true);
    }
    return true;
  };

  const switchToDoctorTab = () => {
    console.log("🩺 Doctor 탭으로 전환");

    // Terminal 컴포넌트에 Doctor 탭으로 전환하라는 이벤트 발송
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('switch-to-doctor-tab'));
    }, 100);
  };

  return (
    <div className="app">
      <div className="main-content">
        <div className="sidebar" style={{ width: sidebarWidth }}>
          <Sidebar
            files={files}
            currentPath={currentPath}
            onFileSelect={openFile}
            onDirectoryChange={(path) => {
              setCurrentPath(path);
              loadDirectory(path);
              // 경로 변경시 설정 파일에 저장
              ipcRenderer.invoke("save-current-path", path);
            }}
            onScriptExecute={executeScript}
            onDoctorTabSwitch={switchToDoctorTab}
            onClaudeCommandExecute={executeClaudeCommand}
          />
        </div>
        <Resizer
          direction="horizontal"
          onResize={(delta) =>
            setSidebarWidth((prev) => Math.max(200, prev + delta))
          }
        />
        <div className="editor-container">
          <Editor
            ref={editorRef}
            currentFile={currentFile}
            content={fileContent}
            onContentChange={() => {}} // 빈 함수로 변경하여 즉시 상태 업데이트 방지
            onSave={saveFile}
            onFileChangeRequest={handleFileChangeRequest}
          />
        </div>
      </div>
      <Resizer
        direction="vertical"
        onResize={(delta) =>
          setTerminalHeight((prev) => Math.max(150, prev - delta))
        }
      />
      <div className="terminal-container" style={{ height: terminalHeight }}>
        <Terminal currentPath={currentPath} terminalId="main-terminal" />
      </div>

      {/* Claude CLI 설치 모달 */}
      <ClaudeInstaller
        isVisible={showClaudeInstaller}
        onInstallComplete={handleClaudeInstallComplete}
        onCancel={handleClaudeInstallCancel}
      />
    </div>
  );
};

export default App;
