import React, { useState, useEffect } from 'react';
import '../styles/claude-installer.css';

const { ipcRenderer } = window.require('electron');

interface ClaudeInstallerProps {
  isVisible: boolean;
  onInstallComplete: () => void;
  onCancel: () => void;
}

interface InstallProgress {
  stage: 'checking' | 'password' | 'installing' | 'completed' | 'error';
  message: string;
  progress: number;
}

const ClaudeInstaller: React.FC<ClaudeInstallerProps> = ({
  isVisible,
  onInstallComplete,
  onCancel,
}) => {
  const [installProgress, setInstallProgress] = useState<InstallProgress>({
    stage: 'checking',
    message: 'Claude CLI 설치 상태를 확인하고 있습니다...',
    progress: 0,
  });
  const [installLogs, setInstallLogs] = useState<string[]>([]);
  const [showPasswordInput, setShowPasswordInput] = useState<boolean>(false);
  const [password, setPassword] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string>('');
  const [isWindows, setIsWindows] = useState<boolean>(false);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [platformInfo, setPlatformInfo] = useState<string>('감지 중...');

  const handleCancel = () => {
    // 설치 진행 중인 경우 확인 메시지 표시
    if (installProgress.stage === 'installing') {
      const confirmCancel = window.confirm(
        '설치가 진행 중입니다. 정말로 취소하시겠습니까?\n\n설치를 중단하면 Claude CLI가 불완전하게 설치될 수 있습니다.'
      );
      if (!confirmCancel) {
        return;
      }
    }
    onCancel();
  };

  useEffect(() => {
    if (isVisible) {
      const platform = window.require('os').platform();
      const windowsPlatform = platform === 'win32';

      setDebugInfo(prev => [...prev, `🔍 플랫폼 감지 시작`]);
      setDebugInfo(prev => [...prev, `📟 감지된 플랫폼: ${platform}`]);
      setDebugInfo(prev => [...prev, `🪟 Windows 여부: ${windowsPlatform}`]);

      setPlatformInfo(`${platform} (Windows: ${windowsPlatform})`);
      setIsWindows(windowsPlatform);

      console.log('플랫폼 감지:', platform, 'Windows:', windowsPlatform);

      // 플랫폼 설정 후 설치 시작
      setTimeout(() => {
        setDebugInfo(prev => [...prev, `🚀 설치 시작 - Windows 모드: ${windowsPlatform}`]);
        startInstallation(windowsPlatform);
      }, 100);
    }
  }, [isVisible]);

  const startInstallation = async (windowsPlatform?: boolean) => {
    try {
      const isWindowsPlatform = windowsPlatform !== undefined ? windowsPlatform : isWindows;

      setDebugInfo(prev => [...prev, `📋 startInstallation 호출됨`]);
      setDebugInfo(prev => [...prev, `🔍 전달받은 windowsPlatform: ${windowsPlatform}`]);
      setDebugInfo(prev => [...prev, `🔍 현재 isWindows 상태: ${isWindows}`]);
      setDebugInfo(prev => [...prev, `🎯 최종 Windows 플랫폼 판정: ${isWindowsPlatform}`]);

      console.log('설치 시작 - Windows 플랫폼:', isWindowsPlatform);

      setInstallProgress({
        stage: 'checking',
        message: 'Claude CLI 설치 상태를 확인하고 있습니다...',
        progress: 10,
      });

      // Claude CLI 설치 확인
      const isInstalled = await ipcRenderer.invoke('check-claude-cli');

      setDebugInfo(prev => [...prev, `📦 Claude CLI 설치 상태: ${isInstalled}`]);

      if (isInstalled) {
        setInstallProgress({
          stage: 'completed',
          message: 'Claude CLI가 이미 설치되어 있습니다!',
          progress: 100,
        });
        setTimeout(() => {
          onInstallComplete();
        }, 1000);
        return;
      }

      setDebugInfo(prev => [...prev, `🛠️ 설치 필요함 - Windows 모드로 진행: ${isWindowsPlatform}`]);

      if (isWindowsPlatform) {
        setDebugInfo(prev => [...prev, `✅ Windows 경로 선택됨 - 비밀번호 입력 건너뛰기`]);

        // Windows에서는 비밀번호 입력 없이 바로 설치 진행
        setInstallProgress({
          stage: 'installing',
          message: 'Claude CLI 설치를 시작합니다...',
          progress: 30,
        });

        setInstallLogs(['🚀 Windows에서 Claude CLI 설치 중...']);
        setDebugInfo(prev => [...prev, `📦 Windows 설치 진행 중...`]);

        const installResult = await installClaudeCLI(''); // 빈 비밀번호로 설치

        if (installResult.success) {
          setInstallProgress({
            stage: 'completed',
            message: 'Claude CLI 설치가 완료되었습니다!',
            progress: 100,
          });

          setInstallLogs(prev => [...prev, '✅ 설치가 성공적으로 완료되었습니다!']);

          setTimeout(() => {
            onInstallComplete();
          }, 2000);
        } else {
          throw new Error(installResult.error || '설치 중 오류가 발생했습니다.');
        }
      } else {
        setDebugInfo(prev => [...prev, `❌ Unix/macOS 경로 선택됨 - 비밀번호 입력 필요`]);

        // macOS/Linux에서는 비밀번호 입력 요청
        setInstallProgress({
          stage: 'password',
          message: '관리자 권한이 필요합니다. 비밀번호를 입력해주세요.',
          progress: 20,
        });

        setInstallLogs(['🔐 관리자 권한 확인 중...']);
        setShowPasswordInput(true);
        setDebugInfo(prev => [...prev, `🔑 비밀번호 입력 창 표시됨`]);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setInstallProgress({
        stage: 'error',
        message: `설치 중 오류가 발생했습니다: ${errorMessage}`,
        progress: 0,
      });

      setInstallLogs(prev => [...prev, `❌ 오류: ${errorMessage}`]);
    }
  };

  const handlePasswordSubmit = async () => {
    if (!password.trim()) {
      setPasswordError('비밀번호를 입력해주세요.');
      return;
    }

    try {
      setPasswordError('');
      setInstallProgress({
        stage: 'installing',
        message: '비밀번호 확인 중...',
        progress: 25,
      });

      // 비밀번호 검증
      const isValidPassword = await ipcRenderer.invoke('validate-password', password);

      if (!isValidPassword) {
        setPasswordError('비밀번호가 올바르지 않습니다.');
        setInstallLogs(prev => [...prev, '❌ 비밀번호 인증 실패']);
        return;
      }

      setShowPasswordInput(false);
      setInstallLogs(prev => [...prev, '✅ 관리자 권한 인증 성공']);

      // 설치 진행
      setInstallProgress({
        stage: 'installing',
        message: '프로그램 초기 셋팅 중입니다...',
        progress: 30,
      });

      // npm install 실행
      const installResult = await installClaudeCLI(password);

      if (installResult.success) {
        setInstallProgress({
          stage: 'completed',
          message: 'Claude CLI 설치가 완료되었습니다!',
          progress: 100,
        });

        setInstallLogs(prev => [...prev, '✅ 설치가 성공적으로 완료되었습니다!']);

        setTimeout(() => {
          onInstallComplete();
        }, 2000);
      } else {
        throw new Error(installResult.error || '설치 중 오류가 발생했습니다.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setInstallProgress({
        stage: 'error',
        message: `설치 중 오류가 발생했습니다: ${errorMessage}`,
        progress: 0,
      });
      setInstallLogs(prev => [...prev, `❌ 오류: ${errorMessage}`]);
    }
  };

  const installClaudeCLI = async (password: string): Promise<{success: boolean, error?: string}> => {
    return new Promise((resolve) => {
      // 설치 진행상황을 시뮬레이션하면서 실제 설치
      const progressSteps = [
        { progress: 40, message: 'npm 패키지 정보를 가져오는 중...' },
        { progress: 60, message: '@anthropic-ai/claude-code 다운로드 중...' },
        { progress: 75, message: '의존성 패키지 설치 중...' },
        { progress: 85, message: '설치 후 구성 중...' },
        { progress: 95, message: '설치 완료 확인 중...' },
      ];

      let currentStep = 0;

      const updateProgress = () => {
        if (currentStep < progressSteps.length) {
          const step = progressSteps[currentStep];
          setInstallProgress(prev => ({
            ...prev,
            progress: step.progress,
            message: step.message,
          }));

          setInstallLogs(prev => [...prev, `📦 ${step.message}`]);
          currentStep++;

          setTimeout(updateProgress, 1500);
        } else {
          // 실제 설치 실행
          executeInstall(resolve, password);
        }
      };

      updateProgress();
    });
  };

  const executeInstall = async (resolve: (value: {success: boolean, error?: string}) => void, password: string) => {
    try {
      const result = await ipcRenderer.invoke('install-claude-cli', password);

      if (result.success) {
        setInstallLogs(prev => [...prev, '🎉 Claude CLI가 성공적으로 설치되었습니다!']);
        resolve({ success: true });
      } else {
        setInstallLogs(prev => [...prev, `❌ 설치 실패: ${result.error}`]);
        resolve({ success: false, error: result.error });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setInstallLogs(prev => [...prev, `❌ 설치 실패: ${errorMessage}`]);
      resolve({ success: false, error: errorMessage });
    }
  };

  if (!isVisible) return null;

  return (
    <div className="claude-installer-overlay">
      <div className="claude-installer-modal">
        <div className="installer-header">
          <h2>🤖 Claude CLI 설치</h2>
          <button className="close-btn" onClick={handleCancel} title="설치 취소">✕</button>
        </div>

        <div className="installer-content">
          {/* 디버깅 패널 */}
          <div className="debug-panel" style={{
            background: '#f0f0f0',
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '10px',
            marginBottom: '15px',
            fontSize: '12px',
            fontFamily: 'monospace'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>🐛 디버깅 정보:</div>
            <div style={{ color: '#666' }}>플랫폼: {platformInfo}</div>
            <div style={{ color: '#666' }}>isWindows 상태: {isWindows.toString()}</div>
            <div style={{ color: '#666' }}>showPasswordInput: {showPasswordInput.toString()}</div>
            <div style={{ color: '#666' }}>설치 단계: {installProgress.stage}</div>
            <div style={{ maxHeight: '100px', overflowY: 'auto', marginTop: '5px' }}>
              {debugInfo.map((info, index) => (
                <div key={index} style={{ fontSize: '11px', color: '#333' }}>{info}</div>
              ))}
            </div>
          </div>

          <div className="progress-section">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${installProgress.progress}%` }}
              ></div>
            </div>

            <div className="progress-text">
              <span className="progress-message">{installProgress.message}</span>
              <span className="progress-percentage">{installProgress.progress}%</span>
            </div>
          </div>

          {showPasswordInput && !isWindows && (
            <div className="password-input-section">
              <div className="password-description">
                <p>🔒 Claude CLI 설치를 위해 관리자 권한이 필요합니다.</p>
                <p>{isWindows ? 'Windows 관리자 비밀번호를 입력해주세요:' : 'macOS 관리자 비밀번호를 입력해주세요:'}</p>
              </div>
              <div className="password-input-container">
                <input
                  type="password"
                  className="password-input"
                  placeholder="관리자 비밀번호"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handlePasswordSubmit();
                    }
                  }}
                  autoFocus
                />
                <button
                  className="password-submit-btn"
                  onClick={handlePasswordSubmit}
                  disabled={!password.trim()}
                >
                  확인
                </button>
              </div>
              {passwordError && (
                <div className="password-error">{passwordError}</div>
              )}
            </div>
          )}

          <div className="install-logs">
            <div className="logs-header">설치 진행상황:</div>
            <div className="logs-content">
              {installLogs.map((log, index) => (
                <div key={index} className="log-line">
                  {log}
                </div>
              ))}
            </div>
          </div>

          {installProgress.stage === 'installing' && (
            <div className="spinner-container">
              <div className="spinner"></div>
              <span>설치 중...</span>
            </div>
          )}

          {installProgress.stage === 'completed' && (
            <div className="success-message">
              <div className="success-icon">✅</div>
              <p>Claude CLI 설치가 완료되었습니다!</p>
              <p>이제 모든 기능을 사용할 수 있습니다.</p>
            </div>
          )}

          {installProgress.stage === 'error' && (
            <div className="error-actions">
              <button className="retry-btn" onClick={() => startInstallation(isWindows)}>
                🔄 다시 시도
              </button>
              <button className="cancel-btn" onClick={handleCancel}>
                취소
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClaudeInstaller;