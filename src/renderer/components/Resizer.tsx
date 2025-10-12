import React, { useState, useCallback } from 'react';
import '../styles/resizer.css';

interface ResizerProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
}

const Resizer: React.FC<ResizerProps> = ({ direction, onResize }) => {
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    let lastX = e.clientX;
    let lastY = e.clientY;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = direction === 'horizontal'
        ? e.clientX - lastX
        : e.clientY - lastY;

      // 이전 마우스 위치 업데이트
      lastX = e.clientX;
      lastY = e.clientY;

      onResize(delta);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [direction, onResize]);

  return (
    <div
      className={`resizer ${direction} ${isResizing ? 'resizing' : ''}`}
      onMouseDown={handleMouseDown}
    />
  );
};

export default Resizer;