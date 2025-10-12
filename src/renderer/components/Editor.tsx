import React, { useState, useEffect, useRef } from 'react';
import '../styles/editor.css';

interface EditorProps {
  currentFile: string | null;
  content: string;
  onContentChange: (content: string) => void;
  onSave: (content: string) => void;
  onFileChangeRequest?: (newFile: string) => Promise<boolean>;
}

const Editor = React.forwardRef<any, EditorProps>((
  {
    currentFile,
    content,
    onContentChange,
    onSave,
    onFileChangeRequest,
  },
  ref
) => {
  const [editorContent, setEditorContent] = useState(content);
  const [isModified, setIsModified] = useState(false);
  const [originalContent, setOriginalContent] = useState(content);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pendingFileChange, setPendingFileChange] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 파일이 변경되거나 새로 로드될 때만 초기화
  useEffect(() => {
    const handleFileChange = async () => {
      if (isModified && currentFile && onFileChangeRequest) {
        const canChange = await onFileChangeRequest(currentFile);
        if (!canChange) return;
      }

      setEditorContent(content);
      setOriginalContent(content);
      setIsModified(false);
    };

    handleFileChange();
  }, [currentFile, content]);

  // 키보드 단축키 처리
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editorContent, currentFile]);

  const handleContentChange = (value: string) => {
    setEditorContent(value);
    // originalContent와 비교하여 수정 여부 판단
    const modified = value !== originalContent;
    setIsModified(modified);
    onContentChange(value);
  };

  const handleSave = () => {
    console.log('저장 버튼 클릭됨!');
    console.log('currentFile:', currentFile);
    console.log('isModified:', isModified);
    console.log('editorContent:', editorContent);

    if (currentFile && isModified) {
      onSave(editorContent);
      // 저장 후 originalContent를 현재 내용으로 업데이트
      setOriginalContent(editorContent);
      setIsModified(false);
      console.log('✅ 파일 저장 완료');

      // 대기 중인 파일 변경이 있다면 처리
      if (pendingFileChange) {
        setPendingFileChange(null);
        setShowSaveDialog(false);
      }
    } else if (!currentFile) {
      console.log('❌ 현재 파일이 없어서 저장할 수 없음');
    } else {
      console.log('❌ 수정된 내용이 없어서 저장할 필요 없음');
    }
  };

  const handleSaveAndContinue = () => {
    handleSave();
    setShowSaveDialog(false);
    setPendingFileChange(null);
  };

  const handleDiscardChanges = () => {
    setShowSaveDialog(false);
    setPendingFileChange(null);
    setIsModified(false);
    setEditorContent(originalContent);
  };

  const handleCancelChange = () => {
    setShowSaveDialog(false);
    setPendingFileChange(null);
  };

  const checkUnsavedChanges = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (isModified) {
        setShowSaveDialog(true);
        // 다이얼로그 결과를 기다리기 위해 임시로 false 반환
        resolve(false);
      } else {
        resolve(true);
      }
    });
  };

  // 외부에서 파일 변경을 확인할 수 있도록 노출
  React.useImperativeHandle(ref, () => ({
    checkUnsavedChanges,
    getContent: () => editorContent,
    isModified,
  }), [isModified, editorContent]);

  const getLanguageFromExtension = (filename: string | null): string => {
    if (!filename) return 'text';
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'css':
        return 'css';
      case 'html':
        return 'html';
      case 'json':
        return 'json';
      case 'md':
        return 'markdown';
      case 'py':
        return 'python';
      default:
        return 'text';
    }
  };

  const addLineNumbers = () => {
    const lines = editorContent.split('\n');
    return lines.map((_, index) => (
      <div key={index} className="line-number">
        {index + 1}
      </div>
    ));
  };

  if (!currentFile) {
    return (
      <div className="editor">
        <div className="editor-placeholder">
          <div className="placeholder-content">
            <h2>P-Desktop 에디터</h2>
            <p>파일을 선택하여 편집을 시작하세요.</p>
            <div className="placeholder-shortcuts">
              <div className="shortcut">
                <kbd>Cmd/Ctrl + S</kbd>
                <span>파일 저장</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="editor">
      <div className="editor-header">
        <div className="tab">
          <span className="tab-icon">📄</span>
          <span className="tab-name">{currentFile.split('/').pop()}</span>
          {isModified && <span className="modified-indicator red-dot">●</span>}
        </div>
        <div className="editor-actions">
          <button 
            onClick={handleSave} 
            disabled={!currentFile}
            className="save-button"
          >
            💾 저장 {isModified ? '●' : ''}
          </button>
        </div>
      </div>
      <div className="editor-content">
        <div className="line-numbers">
          {addLineNumbers()}
        </div>
        <textarea
          ref={textareaRef}
          className={`editor-textarea language-${getLanguageFromExtension(currentFile)}`}
          value={editorContent}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="파일 내용을 입력하세요..."
          spellCheck={false}
        />
      </div>
      <div className="editor-footer">
        <div className="status-bar">
          <span className="language">{getLanguageFromExtension(currentFile)}</span>
          <span className="position">
            줄 {editorContent.substr(0, textareaRef.current?.selectionStart || 0).split('\n').length}, 
            열 {(textareaRef.current?.selectionStart || 0) - editorContent.lastIndexOf('\n', (textareaRef.current?.selectionStart || 1) - 1)}
          </span>
        </div>
      </div>

      {/* 저장 확인 다이얼로그 */}
      {showSaveDialog && (
        <div className="save-dialog-overlay">
          <div className="save-dialog">
            <div className="save-dialog-header">
              <h3>저장하지 않은 변경사항</h3>
            </div>
            <div className="save-dialog-content">
              <p>파일에 저장하지 않은 변경사항이 있습니다.</p>
              <p><strong>{currentFile?.split('/').pop()}</strong></p>
              <p>변경사항을 저장하시겠습니까?</p>
            </div>
            <div className="save-dialog-actions">
              <button className="save-dialog-btn save-btn" onClick={handleSaveAndContinue}>
                💾 저장
              </button>
              <button className="save-dialog-btn discard-btn" onClick={handleDiscardChanges}>
                🗑️ 저장하지 않음
              </button>
              <button className="save-dialog-btn cancel-btn" onClick={handleCancelChange}>
                ❌ 취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

Editor.displayName = 'Editor';
export default Editor;