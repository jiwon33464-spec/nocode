import React, { useState, useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import "../styles/terminal.css";

const { ipcRenderer } = window.require("electron");

interface TerminalProps {
  currentPath: string;
  terminalId: string;
  isExecMode?: boolean;
  switchToClaudeTab?: boolean;
}

type TabType = "terminal" | "claude" | "exec";

interface TerminalInstance {
  terminal: XTerm;
  fitAddon: FitAddon;
  initialized: boolean;
}

const Terminal: React.FC<TerminalProps> = ({
  currentPath,
  terminalId: propTerminalId,
  isExecMode = false,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("terminal");
  const [execScript, setExecScript] = useState<string | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);

  // Mode switching function
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    console.log(`🔄 모드 전환: ${!isSelectionMode ? '선택' : '입력'} 모드`);
  };

  // Keyboard shortcuts for mode switching
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+S (또는 Cmd+Shift+S) for toggling selection mode
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        toggleSelectionMode();
        console.log('⌨️ 키보드 단축키로 모드 전환');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Refs for terminal containers
  const terminalRef = useRef<HTMLDivElement>(null);
  const claudeTerminalRef = useRef<HTMLDivElement>(null);
  const execTerminalRef = useRef<HTMLDivElement>(null);

  // Terminal instances
  const [terminalInstance, setTerminalInstance] =
    useState<TerminalInstance | null>(null);
  const [claudeTerminalInstance, setClaudeTerminalInstance] =
    useState<TerminalInstance | null>(null);
  const [execTerminalInstance, setExecTerminalInstance] =
    useState<TerminalInstance | null>(null);

  // Terminal IDs
  const terminalId = useRef<string>(propTerminalId || "terminal-1");
  const claudeTerminalId = useRef<string>("claude-terminal-1");
  const execTerminalId = useRef<string>("exec-terminal");

  console.log(`🔧 Terminal 컴포넌트 초기화:`, {
    propTerminalId,
    actualTerminalId: terminalId.current,
    claudeTerminalId: claudeTerminalId.current,
    execTerminalId: execTerminalId.current,
    isExecMode,
    currentPath,
  });

  // Path tracking
  const isInitialMount = useRef<boolean>(true);
  const prevCurrentPath = useRef<string>("");

  // URL 감지 중복 실행 방지를 위한 타이머
  const urlDetectionCooldown = useRef<boolean>(false);

  // 감지된 URL 기록 (터미널 종료 시까지 유지)
  const detectedUrls = useRef<Set<string>>(new Set());

  // Doctor 탭 전환 이벤트 리스너
  useEffect(() => {
    const handleSwitchToDoctor = () => {
      console.log("🩺 Doctor 탭 전환 이벤트 수신");
      if (!isExecMode) {
        setActiveTab("claude");
      }
    };

    window.addEventListener("switch-to-doctor-tab", handleSwitchToDoctor);
    return () => {
      window.removeEventListener("switch-to-doctor-tab", handleSwitchToDoctor);
    };
  }, [isExecMode]);

  const addConsoleLog = useCallback((message: string) => {
    console.log(`📝 Console Log: ${message}`);
  }, []);

  // Terminal configuration
  const getTerminalConfig = () => ({
    theme: {
      background: "#ffffff",
      foreground: "#333333",
      cursor: "#007acc",
      cursorAccent: "#ffffff",
    },
    fontFamily:
      "SF Mono, Monaco, Inconsolata, Roboto Mono, Consolas, Courier New, monospace",
    fontSize: 14,
    lineHeight: 1.3,
    letterSpacing: 0,
    cursorBlink: true,
    cursorStyle: "block" as const,
    convertEol: true,
    scrollback: 1000,
    allowTransparency: false,
    disableStdin: false,
    macOptionIsMeta: false, // 텍스트 선택을 위해 비활성화
    windowsMode: false,
    altClickMovesCursor: false, // 텍스트 선택을 위해 비활성화
    fontWeight: "normal" as const,
    fontWeightBold: "bold" as const,
    minimumContrastRatio: 1,
    // 텍스트 선택 및 드래그 활성화 - 모든 마우스 차단 해제
    rightClickSelectsWord: false, // 일단 비활성화해서 테스트
    allowProposedApi: true,
    screenReaderMode: false,
    scrollSensitivity: 1,
    fastScrollSensitivity: 5,
    // 마우스 모드 완전 비활성화
    logLevel: 'off' as const,
  });

  // Create terminal instance
  const createTerminalInstance = useCallback(
    (
      containerRef: React.RefObject<HTMLDivElement | null>,
      id: string,
      autoCommand?: string
    ): TerminalInstance | null => {
      if (!containerRef.current) return null;

      const terminal = new XTerm(getTerminalConfig());
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      // Mount terminal
      terminal.open(containerRef.current);
      fitAddon.fit();

      // 터미널 모드에 따른 설정 적용
      const applyTerminalMode = (selectionModeEnabled: boolean) => {
        if (!terminal.element) return;

        console.log(`🔧 터미널 모드 적용: ${selectionModeEnabled ? '선택' : '입력'} 모드`);

        if (selectionModeEnabled) {
          // 선택 모드: 텍스트 선택 활성화, 입력 비활성화
          const enableTextSelection = (element: HTMLElement) => {
            element.style.setProperty('user-select', 'text', 'important');
            element.style.setProperty('-webkit-user-select', 'text', 'important');
            element.style.setProperty('cursor', 'text', 'important');
          };

          // 모든 요소에 텍스트 선택 활성화
          enableTextSelection(terminal.element);
          const allElements = terminal.element.querySelectorAll('*');
          allElements.forEach((el) => enableTextSelection(el as HTMLElement));

          // Canvas 마우스 이벤트 비활성화 (텍스트 선택 우선)
          const canvas = terminal.element.querySelector('canvas');
          if (canvas) {
            (canvas as HTMLElement).style.setProperty('pointer-events', 'none', 'important');
          }

          // 터미널 입력 비활성화
          terminal.options.disableStdin = true;
          console.log('✅ 선택 모드 활성화: 텍스트 선택 가능, 입력 비활성화');
        } else {
          // 입력 모드: 키보드 입력 활성화, 텍스트 선택 비활성화
          const disableTextSelection = (element: HTMLElement) => {
            element.style.setProperty('user-select', 'none', 'important');
            element.style.setProperty('-webkit-user-select', 'none', 'important');
            element.style.setProperty('cursor', 'default', 'important');
          };

          // 모든 요소에 텍스트 선택 비활성화
          disableTextSelection(terminal.element);
          const allElements = terminal.element.querySelectorAll('*');
          allElements.forEach((el) => disableTextSelection(el as HTMLElement));

          // Canvas 마우스 이벤트 활성화 (터미널 입력 우선)
          const canvas = terminal.element.querySelector('canvas');
          if (canvas) {
            (canvas as HTMLElement).style.setProperty('pointer-events', 'auto', 'important');
          }

          // 터미널 입력 활성화
          terminal.options.disableStdin = false;
          terminal.focus();
          console.log('✅ 입력 모드 활성화: 키보드 입력 가능, 텍스트 선택 비활성화');
        }
      };

      // 초기 모드 설정 (기본값: 입력 모드)
      setTimeout(() => {
        applyTerminalMode(false);
      }, 100);

      // 모드 변경 감지 및 적용을 위한 참조 저장
      (terminal as any)._applyTerminalMode = applyTerminalMode;

      // Handle input
      terminal.onData((data) => {
        console.log(`⌨️ 터미널 입력:`, {
          id,
          dataPreview: data.substring(0, 20),
        });
        ipcRenderer.invoke("terminal-write", id, data);
      });

      // 터미널에 키보드 이벤트 리스너 추가 (복사/붙여넣기 기능)
      terminal.onKey(({ domEvent }) => {
        // Ctrl+C 또는 Cmd+C로 선택된 텍스트 복사
        if ((domEvent.ctrlKey || domEvent.metaKey) && domEvent.key === "c") {
          const selection = terminal.getSelection();
          if (selection) {
            domEvent.preventDefault();
            ipcRenderer
              .invoke("copy-terminal-selection", selection)
              .then((success: boolean) => {
                if (success) {
                  console.log("✅ 터미널 선택 텍스트 복사됨:", id);
                }
              });
          }
        }

        // Ctrl+V 또는 Cmd+V로 클립보드 내용 붙여넣기
        if ((domEvent.ctrlKey || domEvent.metaKey) && domEvent.key === "v") {
          domEvent.preventDefault();
          navigator.clipboard.readText()
            .then((text: string) => {
              if (text) {
                console.log("📋 클립보드에서 붙여넣기:", id);
                ipcRenderer.invoke("terminal-write", id, text);
              }
            })
            .catch((error: any) => {
              console.error("❌ 클립보드 읽기 실패:", error);
            });
        }
      });

      // 우클릭 컨텍스트 메뉴 처리
      terminal.element?.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        const selection = terminal.getSelection();

        if (selection) {
          // 선택된 텍스트가 있으면 복사 메뉴 표시
          const copyOption = window.confirm('선택된 텍스트를 클립보드에 복사하시겠습니까?');
          if (copyOption) {
            ipcRenderer.invoke("copy-terminal-selection", selection)
              .then((success: boolean) => {
                if (success) {
                  console.log("✅ 우클릭으로 터미널 텍스트 복사됨:", id);
                }
              });
          }
        } else {
          // 선택된 텍스트가 없으면 붙여넣기 메뉴 표시
          navigator.clipboard.readText()
            .then((text: string) => {
              if (text) {
                const pasteOption = window.confirm(`클립보드 내용을 붙여넣기 하시겠습니까?\n\n${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
                if (pasteOption) {
                  console.log("📋 우클릭으로 클립보드 붙여넣기:", id);
                  ipcRenderer.invoke("terminal-write", id, text);
                }
              } else {
                window.alert('클립보드가 비어있습니다.');
              }
            })
            .catch((error: any) => {
              console.error("❌ 클립보드 읽기 실패:", error);
              window.alert('클립보드 접근 권한이 필요합니다.');
            });
        }
      });

      // Handle resize
      terminal.onResize(({ cols, rows }) => {
        ipcRenderer.invoke("terminal-resize", id, cols, rows);
      });

      // Create terminal process
      console.log(`🚀 터미널 생성 시도:`, { id, currentPath });
      ipcRenderer
        .invoke("terminal-create", id, currentPath)
        .then(() => {
          console.log(`✅ 터미널 생성 성공:`, id);
          addConsoleLog(`터미널 생성됨: ${id}`);

          // Auto-execute command if provided
          if (autoCommand) {
            console.log(`⏰ 자동 명령어 실행 예약:`, { id, autoCommand });
            setTimeout(() => {
              console.log(`▶️ 자동 명령어 실행 중:`, { id, autoCommand });
              ipcRenderer.invoke("terminal-write", id, `${autoCommand}\r`);
              addConsoleLog(`자동 명령어 실행: ${autoCommand}`);
            }, 1000);
          }
        })
        .catch((error: any) => {
          console.error(`❌ 터미널 생성 실패:`, { id, error });
          addConsoleLog(`터미널 생성 실패: ${id} - ${error}`);
        });

      // Focus terminal
      setTimeout(() => terminal.focus(), 100);

      return {
        terminal,
        fitAddon,
        initialized: true,
      };
    },
    [currentPath, addConsoleLog]
  );

  // Initialize regular terminal
  const initializeTerminal = useCallback(() => {
    console.log(`🔧 일반 터미널 초기화 시도:`, {
      alreadyInitialized: terminalInstance?.initialized,
      terminalId: terminalId.current,
      hasTerminalRef: !!terminalRef.current,
    });

    if (terminalInstance?.initialized) {
      console.log(`⚠️ 일반 터미널이 이미 초기화됨`);
      return;
    }

    const instance = createTerminalInstance(terminalRef, terminalId.current);

    if (instance) {
      console.log(`✅ 일반 터미널 인스턴스 생성됨:`, terminalId.current);
      setTerminalInstance(instance);
    } else {
      console.error(`❌ 일반 터미널 인스턴스 생성 실패:`, terminalId.current);
    }
  }, [createTerminalInstance, terminalInstance]);

  // Apply mode changes to all terminals when selection mode changes
  useEffect(() => {
    console.log(`🔄 모드 변경 감지: ${isSelectionMode ? '선택' : '입력'} 모드`);

    // 모든 터미널 인스턴스에 모드 적용
    if (terminalInstance?.terminal && (terminalInstance.terminal as any)._applyTerminalMode) {
      (terminalInstance.terminal as any)._applyTerminalMode(isSelectionMode);
    }
    if (claudeTerminalInstance?.terminal && (claudeTerminalInstance.terminal as any)._applyTerminalMode) {
      (claudeTerminalInstance.terminal as any)._applyTerminalMode(isSelectionMode);
    }
    if (execTerminalInstance?.terminal && (execTerminalInstance.terminal as any)._applyTerminalMode) {
      (execTerminalInstance.terminal as any)._applyTerminalMode(isSelectionMode);
    }
  }, [isSelectionMode, terminalInstance, claudeTerminalInstance, execTerminalInstance]);

  // Initialize Claude terminal
  const initializeClaudeTerminal = useCallback(() => {
    console.log(`🔧 Claude 터미널 초기화 시도:`, {
      alreadyInitialized: claudeTerminalInstance?.initialized,
      claudeTerminalId: claudeTerminalId.current,
      hasClaudeTerminalRef: !!claudeTerminalRef.current,
    });

    if (claudeTerminalInstance?.initialized) {
      console.log(`⚠️ Claude 터미널이 이미 초기화됨`);
      return;
    }

    const instance = createTerminalInstance(
      claudeTerminalRef,
      claudeTerminalId.current
    );

    if (instance) {
      console.log(
        `✅ Claude 터미널 인스턴스 생성됨:`,
        claudeTerminalId.current
      );
      setClaudeTerminalInstance(instance);
    } else {
      console.error(
        `❌ Claude 터미널 인스턴스 생성 실패:`,
        claudeTerminalId.current
      );
    }
  }, [createTerminalInstance, claudeTerminalInstance]);

  // Initialize Exec terminal
  const initializeExecTerminal = useCallback(() => {
    console.log(`🔧 Exec 터미널 초기화 시도:`, {
      alreadyInitialized: execTerminalInstance?.initialized,
      execTerminalId: execTerminalId.current,
      hasExecTerminalRef: !!execTerminalRef.current,
    });

    if (execTerminalInstance?.initialized) {
      console.log(`⚠️ Exec 터미널이 이미 초기화됨`);
      return;
    }

    const instance = createTerminalInstance(
      execTerminalRef,
      execTerminalId.current
    );

    if (instance) {
      console.log(`✅ Exec 터미널 인스턴스 생성됨:`, execTerminalId.current);
      setExecTerminalInstance(instance);
    } else {
      console.error(
        `❌ Exec 터미널 인스턴스 생성 실패:`,
        execTerminalId.current
      );
    }
  }, [createTerminalInstance, execTerminalInstance]);

  // Handle terminal data
  useEffect(() => {
    const handleTerminalData = (_event: any, id: string, data: string) => {
      console.log(`📡 터미널 데이터 수신:`, {
        id,
        dataLength: data.length,
        expectedTerminalId: terminalId.current,
        expectedClaudeTerminalId: claudeTerminalId.current,
        expectedExecTerminalId: execTerminalId.current,
        hasTerminalInstance: !!terminalInstance?.terminal,
        hasClaudeTerminalInstance: !!claudeTerminalInstance?.terminal,
        hasExecTerminalInstance: !!execTerminalInstance?.terminal,
      });

      if (id === terminalId.current && terminalInstance?.terminal) {
        console.log(`✅ 일반 터미널에 데이터 쓰기:`, {
          id,
          dataPreview: data.substring(0, 50),
        });
        terminalInstance.terminal.write(data);
      } else if (
        id === claudeTerminalId.current &&
        claudeTerminalInstance?.terminal
      ) {
        console.log(`✅ Claude 터미널에 데이터 쓰기:`, {
          id,
          dataPreview: data.substring(0, 50),
        });
        claudeTerminalInstance.terminal.write(data);
      } else if (
        id === execTerminalId.current &&
        execTerminalInstance?.terminal
      ) {
        console.log(`✅ Exec 터미널에 데이터 쓰기:`, {
          id,
          dataPreview: data.substring(0, 50),
        });
        execTerminalInstance.terminal.write(data);
      } else {
        console.warn(`🚫 터미널 데이터 매칭 실패:`, {
          receivedId: id,
          expectedIds: [
            terminalId.current,
            claudeTerminalId.current,
            execTerminalId.current,
          ],
          terminalInstanceExists: !!terminalInstance?.terminal,
          claudeTerminalInstanceExists: !!claudeTerminalInstance?.terminal,
          execTerminalInstanceExists: !!execTerminalInstance?.terminal,
        });
      }
    };

    const handleTerminalExit = (_event: any, id: string, exitInfo: any) => {
      const message = `터미널이 종료되었습니다 (코드: ${exitInfo.exitCode})`;
      console.log(`🔚 터미널 종료:`, { id, exitInfo });
      addConsoleLog(message);

      // 터미널 종료 시 감지된 URL 목록 초기화
      console.log(`🧹 감지된 URL 목록 초기화 (터미널 종료: ${id})`);
      detectedUrls.current.clear();

      if (id === terminalId.current && terminalInstance?.terminal) {
        console.log(`🔚 일반 터미널 종료 처리:`, id);
        terminalInstance.terminal.write(`\r\n\x1b[31m${message}\x1b[0m\r\n`);
      } else if (
        id === claudeTerminalId.current &&
        claudeTerminalInstance?.terminal
      ) {
        console.log(`🔚 Claude 터미널 종료 처리:`, id);
        claudeTerminalInstance.terminal.write(
          `\r\n\x1b[31mClaude ${message}\x1b[0m\r\n`
        );
      } else if (
        id === execTerminalId.current &&
        execTerminalInstance?.terminal
      ) {
        console.log(`🔚 Exec 터미널 종료 처리:`, id);
        execTerminalInstance.terminal.write(
          `\r\n\x1b[31mExec ${message}\x1b[0m\r\n`
        );
      }
    };

    // URL 감지 핸들러
    const handleUrlDetected = (_event: any, id: string, url: string) => {
      console.log(`🔗 터미널에서 URL 감지:`, { id, url });

      // 이미 감지된 URL인지 확인
      if (detectedUrls.current.has(url)) {
        console.log(`🔄 이미 감지된 URL 무시: ${url}`);
        return;
      }

      // 3초 쿨다운 체크
      if (urlDetectionCooldown.current) {
        console.log(`⏳ URL 감지 쿨다운 중... URL 무시: ${url}`);
        return;
      }

      // URL을 감지된 목록에 추가
      detectedUrls.current.add(url);

      // Claude 관련 URL인지 확인
      const isClaudeUrl =
        url.includes("claude.ai") ||
        url.includes("anthropic.com") ||
        url.includes("claude") ||
        url.includes("localhost:3000") ||
        url.includes("127.0.0.1:3000");

      if (isClaudeUrl) {
        // Claude 관련 URL은 알럿으로 확인
        const shouldOpen = false;

        if (shouldOpen) {
          // 브라우저에서 열기
          ipcRenderer.invoke("open-url", url).then((success: boolean) => {
            if (success) {
              console.log("✅ Claude URL 브라우저에서 열림:", url);
            } else {
              console.error("❌ Claude URL 열기 실패, 클립보드에 복사:", url);
              ipcRenderer.invoke("copy-to-clipboard", url);
            }
          });
        } else {
          // 클립보드에 복사
          ipcRenderer
            .invoke("copy-to-clipboard", url)
            .then((success: boolean) => {
              if (success) {
                console.log("✅ Claude URL 클립보드에 복사됨:", url);
                const targetTerminal =
                  id === terminalId.current
                    ? terminalInstance?.terminal
                    : id === claudeTerminalId.current
                    ? claudeTerminalInstance?.terminal
                    : id === execTerminalId.current
                    ? execTerminalInstance?.terminal
                    : null;

                if (targetTerminal) {
                  targetTerminal.write(
                    `\r\n\x1b[32m✅ URL이 클립보드에 복사되었습니다: ${url}\x1b[0m\r\n`
                  );
                }
              }
            });
        }
      } else {
        // 다른 URL은 자동으로 클립보드에 복사
        console.log(`🔗 일반 URL 자동 클립보드 복사:`, url);

        ipcRenderer
          .invoke("copy-to-clipboard", url)
          .then((success: boolean) => {
            if (success) {
              console.log("✅ 일반 URL 클립보드에 복사됨:", url);
              const targetTerminal =
                id === terminalId.current
                  ? terminalInstance?.terminal
                  : id === claudeTerminalId.current
                  ? claudeTerminalInstance?.terminal
                  : id === execTerminalId.current
                  ? execTerminalInstance?.terminal
                  : null;

              if (targetTerminal) {
                targetTerminal.write(
                  `\r\n\x1b[36m📋 URL이 클립보드에 복사되었습니다: ${url}\x1b[0m\r\n`
                );
              }
            }
          });
      }
    };

    ipcRenderer.on("terminal-data", handleTerminalData);
    ipcRenderer.on("terminal-exit", handleTerminalExit);
    ipcRenderer.on("terminal-url-detected", handleUrlDetected);

    return () => {
      ipcRenderer.removeListener("terminal-data", handleTerminalData);
      ipcRenderer.removeListener("terminal-exit", handleTerminalExit);
      ipcRenderer.removeListener("terminal-url-detected", handleUrlDetected);
    };
  }, [
    terminalInstance,
    claudeTerminalInstance,
    execTerminalInstance,
    addConsoleLog,
  ]);

  // Handle path changes
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevCurrentPath.current = currentPath;
      return;
    }

    if (currentPath && currentPath !== prevCurrentPath.current) {
      const cdCommand = `cd "${currentPath}"\r`;

      if (terminalInstance?.terminal) {
        ipcRenderer.invoke("terminal-write", terminalId.current, cdCommand);
        addConsoleLog(`터미널 작업 디렉토리 변경: ${currentPath}`);
      }

      if (claudeTerminalInstance?.terminal) {
        ipcRenderer.invoke(
          "terminal-write",
          claudeTerminalId.current,
          cdCommand
        );
        addConsoleLog(`Claude 터미널 작업 디렉토리 변경: ${currentPath}`);
      }

      if (execTerminalInstance?.terminal) {
        ipcRenderer.invoke("terminal-write", execTerminalId.current, cdCommand);
        addConsoleLog(`Exec 터미널 작업 디렉토리 변경: ${currentPath}`);
      }

      prevCurrentPath.current = currentPath;
    }
  }, [
    currentPath,
    terminalInstance,
    claudeTerminalInstance,
    execTerminalInstance,
    addConsoleLog,
  ]);

  // Initialize all terminals at startup (not just on tab switch)
  useEffect(() => {
    console.log(`🎯 터미널 초기화 트리거:`, {
      isExecMode,
      activeTab,
      terminalInitialized: terminalInstance?.initialized,
      claudeTerminalInitialized: claudeTerminalInstance?.initialized,
      execTerminalInitialized: execTerminalInstance?.initialized,
    });

    if (isExecMode) {
      console.log(`⚡ Exec 모드 - 일반 터미널 초기화 체크`);
      if (!terminalInstance?.initialized) {
        console.log(`🔧 Exec 모드에서 일반 터미널 초기화`);
        initializeTerminal();
      }
    } else {
      // 모든 터미널을 미리 초기화 (백그라운드에서 계속 동작하도록)
      if (!terminalInstance?.initialized) {
        console.log(`🔧 일반 터미널 초기화`);
        initializeTerminal();
      }
      if (!claudeTerminalInstance?.initialized) {
        console.log(`🔧 Claude 터미널 초기화`);
        initializeClaudeTerminal();
      }
      if (!execTerminalInstance?.initialized) {
        console.log(`🔧 Exec 터미널 초기화`);
        initializeExecTerminal();
      }
    }
  }, [
    isExecMode,
    terminalInstance,
    claudeTerminalInstance,
    execTerminalInstance,
    initializeTerminal,
    initializeClaudeTerminal,
    initializeExecTerminal,
  ]);

  // Handle active tab changes (resize and focus)
  useEffect(() => {
    console.log(`🔄 탭 전환 처리:`, { activeTab });

    // 약간의 지연을 두어 DOM이 업데이트된 후 처리
    const timer = setTimeout(() => {
      if (
        activeTab === "terminal" &&
        terminalInstance?.fitAddon &&
        terminalInstance?.terminal
      ) {
        console.log(`📐 Terminal 탭 리사이즈`);
        terminalInstance.fitAddon.fit();
        terminalInstance.terminal.focus();
      } else if (
        activeTab === "claude" &&
        claudeTerminalInstance?.fitAddon &&
        claudeTerminalInstance?.terminal
      ) {
        console.log(`📐 Claude 탭 리사이즈`);
        claudeTerminalInstance.fitAddon.fit();
        claudeTerminalInstance.terminal.focus();
      } else if (
        activeTab === "exec" &&
        execTerminalInstance?.fitAddon &&
        execTerminalInstance?.terminal
      ) {
        console.log(`📐 Exec 탭 리사이즈`);
        execTerminalInstance.fitAddon.fit();
        execTerminalInstance.terminal.focus();
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [
    activeTab,
    terminalInstance,
    claudeTerminalInstance,
    execTerminalInstance,
  ]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (terminalInstance?.fitAddon) {
        terminalInstance.fitAddon.fit();
      }
      if (claudeTerminalInstance?.fitAddon) {
        claudeTerminalInstance.fitAddon.fit();
      }
      if (execTerminalInstance?.fitAddon) {
        execTerminalInstance.fitAddon.fit();
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [terminalInstance, claudeTerminalInstance, execTerminalInstance]);

  // Terminal actions
  const clearTerminal = () => {
    if (terminalInstance?.terminal) {
      terminalInstance.terminal.clear();
      addConsoleLog("터미널 클리어됨");
      setTimeout(() => terminalInstance.terminal.focus(), 50);
    }
  };

  const clearClaudeTerminal = () => {
    if (claudeTerminalInstance?.terminal) {
      claudeTerminalInstance.terminal.clear();
      addConsoleLog("Claude 터미널 클리어됨");
      setTimeout(() => claudeTerminalInstance.terminal.focus(), 50);
    }
  };

  const clearExecTerminal = () => {
    if (execTerminalInstance?.terminal) {
      execTerminalInstance.terminal.clear();
      addConsoleLog("Exec 터미널 클리어됨");
      setTimeout(() => execTerminalInstance.terminal.focus(), 50);
    }
  };

  const restartTerminal = () => {
    if (terminalInstance?.terminal) {
      ipcRenderer.invoke("terminal-kill", terminalId.current);
      terminalInstance.terminal.dispose();
      setTerminalInstance(null);

      setTimeout(() => {
        initializeTerminal();
        addConsoleLog("터미널 재시작됨");
      }, 100);
    }
  };

  const restartClaudeTerminal = () => {
    if (claudeTerminalInstance?.terminal) {
      ipcRenderer.invoke("terminal-kill", claudeTerminalId.current);
      claudeTerminalInstance.terminal.dispose();
      setClaudeTerminalInstance(null);

      setTimeout(() => {
        initializeClaudeTerminal();
        addConsoleLog("Claude 터미널 재시작됨");
      }, 100);
    }
  };

  const restartExecTerminal = () => {
    if (execTerminalInstance?.terminal) {
      ipcRenderer.invoke("terminal-kill", execTerminalId.current);
      execTerminalInstance.terminal.dispose();
      setExecTerminalInstance(null);

      setTimeout(() => {
        initializeExecTerminal();
        addConsoleLog("Exec 터미널 재시작됨");
      }, 100);
    }
  };

  const focusTerminal = () => {
    if (activeTab === "terminal" && terminalInstance?.terminal) {
      terminalInstance.terminal.focus();
    } else if (activeTab === "claude" && claudeTerminalInstance?.terminal) {
      claudeTerminalInstance.terminal.focus();
    } else if (activeTab === "exec" && execTerminalInstance?.terminal) {
      execTerminalInstance.terminal.focus();
    }
  };

  const executeScript = (scriptName: string) => {
    console.log(`⚡ 스크립트 실행 요청:`, scriptName);

    // Exec 탭으로 전환
    setActiveTab("exec");
    setExecScript(scriptName);

    // Exec 터미널에서 스크립트 실행
    setTimeout(() => {
      if (execTerminalInstance?.terminal) {
        console.log(`▶️ Exec 터미널에서 스크립트 실행:`, scriptName);
        ipcRenderer.invoke(
          "terminal-write",
          execTerminalId.current,
          `npm run ${scriptName}\r`
        );
        addConsoleLog(`스크립트 실행: npm run ${scriptName}`);

        // 포커스 설정
        setTimeout(() => {
          execTerminalInstance.terminal.focus();
        }, 100);
      }
    }, 100); // 탭 전환 후 더 빠른 실행
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (terminalInstance?.terminal) {
        ipcRenderer.invoke("terminal-kill", terminalId.current);
        terminalInstance.terminal.dispose();
      }
      if (claudeTerminalInstance?.terminal) {
        ipcRenderer.invoke("terminal-kill", claudeTerminalId.current);
        claudeTerminalInstance.terminal.dispose();
      }
      if (execTerminalInstance?.terminal) {
        ipcRenderer.invoke("terminal-kill", execTerminalId.current);
        execTerminalInstance.terminal.dispose();
      }
    };
  }, [terminalInstance, claudeTerminalInstance, execTerminalInstance]);

  // Expose executeScript for external use
  useEffect(() => {
    const currentTerminalId = terminalId.current;
    const handleExecuteScript = (scriptName: string) =>
      executeScript(scriptName);

    // Store reference for cleanup
    (window as any)[`executeScript_${currentTerminalId}`] = handleExecuteScript;

    return () => {
      delete (window as any)[`executeScript_${currentTerminalId}`];
    };
  }, [executeScript]);

  // Exec mode rendering
  if (isExecMode) {
    return (
      <div className="terminal-container exec-mode">
        <div className="terminal-header">
          <div className="terminal-title">
            ⚡ Exec Terminal
            {execScript && (
              <span className="exec-script-name">- {execScript}</span>
            )}
          </div>
          <div className="terminal-actions">
            {/* Exec 모드에서도 모드 전환 버튼 표시 */}
            <button
              onClick={toggleSelectionMode}
              className={`action-button mode-toggle-btn ${isSelectionMode ? 'selection-active' : 'input-active'}`}
              title={`${isSelectionMode ? '입력 모드로 전환 (키보드 입력 활성화)' : '선택 모드로 전환 (텍스트 선택 활성화)'} | 단축키: Ctrl+Shift+S`}
            >
              {isSelectionMode ? '⌨️ 입력' : '🖱️ 선택'}
            </button>

            <button onClick={clearTerminal} className="action-button">
              🗑️ Clear
            </button>
            <button
              onClick={restartTerminal}
              className="action-button restart-btn"
            >
              🔄 Restart
            </button>
          </div>
        </div>
        <div className="terminal-content">
          <div className="terminal-wrapper" onClick={focusTerminal}>
            <div ref={terminalRef} className="xterm-container" />
          </div>
        </div>
      </div>
    );
  }

  // Regular mode rendering
  return (
    <div className="terminal-container">
      <div className="terminal-header">
        <div className="terminal-tabs">
          <button
            className={`terminal-tab ${
              activeTab === "terminal" ? "active" : ""
            }`}
            onClick={() => setActiveTab("terminal")}
          >
            🖥️ Terminal
          </button>
          <button
            className={`terminal-tab ${activeTab === "claude" ? "active" : ""}`}
            onClick={() => setActiveTab("claude")}
          >
            🩺 Doctor
          </button>
          <button
            className={`terminal-tab ${activeTab === "exec" ? "active" : ""}`}
            onClick={() => setActiveTab("exec")}
          >
            ⚡ Exec
          </button>
        </div>
        <div className="terminal-actions">
          {/* 모드 전환 버튼 */}
          <button
            onClick={toggleSelectionMode}
            className={`action-button mode-toggle-btn ${isSelectionMode ? 'selection-active' : 'input-active'}`}
            title={`${isSelectionMode ? '입력 모드로 전환 (키보드 입력 활성화)' : '선택 모드로 전환 (텍스트 선택 활성화)'} | 단축키: Ctrl+Shift+S`}
          >
            {isSelectionMode ? '⌨️ 입력' : '🖱️ 선택'}
          </button>

          {activeTab === "terminal" && (
            <>
              <button onClick={clearTerminal} className="action-button">
                🗑️ Clear
              </button>
              <button
                onClick={restartTerminal}
                className="action-button restart-btn"
              >
                🔄 Restart
              </button>
            </>
          )}
          {activeTab === "claude" && (
            <>
              <button onClick={clearClaudeTerminal} className="action-button">
                🗑️ Clear
              </button>
              <button
                onClick={restartClaudeTerminal}
                className="action-button restart-btn"
              >
                🔄 Restart
              </button>
            </>
          )}
          {activeTab === "exec" && (
            <>
              <button onClick={clearExecTerminal} className="action-button">
                🗑️ Clear
              </button>
              <button
                onClick={restartExecTerminal}
                className="action-button restart-btn"
              >
                🔄 Restart
              </button>
            </>
          )}
        </div>
      </div>
      <div className="terminal-content">
        <div
          className={`terminal-wrapper ${
            activeTab === "terminal" ? "active" : "hidden"
          }`}
          onClick={focusTerminal}
        >
          <div ref={terminalRef} className="xterm-container" />
        </div>
        <div
          className={`terminal-wrapper ${
            activeTab === "claude" ? "active" : "hidden"
          }`}
          onClick={focusTerminal}
        >
          <div ref={claudeTerminalRef} className="xterm-container" />
        </div>
        <div
          className={`terminal-wrapper ${
            activeTab === "exec" ? "active" : "hidden"
          }`}
          onClick={focusTerminal}
        >
          <div className="exec-terminal-header">
            {execScript && (
              <div className="exec-script-info">실행 중: {execScript}</div>
            )}
          </div>
          <div ref={execTerminalRef} className="xterm-container" />
        </div>
      </div>
    </div>
  );
};

export default Terminal;
