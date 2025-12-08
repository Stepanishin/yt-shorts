'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface VideoPlayerProps {
  videoUrl: string;
  onTrimChange?: (startTime: number, endTime: number) => void;
  initialStartTime?: number;
  initialEndTime?: number;
  maxDuration?: number;
}

export default function VideoPlayer({
  videoUrl,
  onTrimChange,
  initialStartTime = 0,
  initialEndTime,
  maxDuration,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const isDraggingStartRef = useRef(false);
  const isDraggingEndRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [trimStart, setTrimStart] = useState(initialStartTime);
  const [trimEnd, setTrimEnd] = useState<number | null>(initialEndTime || null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      const endTime = initialEndTime || maxDuration || video.duration;
      setTrimEnd(Math.min(endTime, video.duration));
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);

      // Автоматическая остановка при достижении конца обрезки
      if (trimEnd !== null && video.currentTime >= trimEnd) {
        video.pause();
        setIsPlaying(false);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [videoUrl, trimEnd, initialEndTime, maxDuration]);

  // Обновляем trimEnd при изменении maxDuration
  useEffect(() => {
    if (maxDuration && duration > 0) {
      const newEnd = Math.min(trimStart + maxDuration, duration);
      setTrimEnd(newEnd);
      if (onTrimChange) {
        onTrimChange(trimStart, newEnd);
      }
    }
  }, [maxDuration, duration]);

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  const handleStop = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = trimStart;
      setCurrentTime(trimStart);
    }
  };

  const handlePlayRegion = () => {
    if (videoRef.current && trimEnd !== null) {
      videoRef.current.currentTime = trimStart;
      videoRef.current.play();
    }
  };

  const handleResetTrim = () => {
    const availableDuration = duration || maxDuration || 0;
    if (availableDuration === 0) return;

    const newEnd = Math.min(maxDuration || availableDuration, availableDuration);

    setTrimStart(0);
    setTrimEnd(newEnd);
    setCurrentTime(0);
    setIsPlaying(false);

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }

    if (onTrimChange) {
      onTrimChange(0, newEnd);
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !videoRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;

    videoRef.current.currentTime = Math.max(trimStart, Math.min(newTime, trimEnd || duration));
  };

  const handleStartDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('START DRAG - setting isDraggingStartRef to true');
    isDraggingStartRef.current = true;
  };

  const handleEndDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('END DRAG - setting isDraggingEndRef to true');
    isDraggingEndRef.current = true;
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingStartRef.current && !isDraggingEndRef.current) return;
    if (!timelineRef.current) return;

    e.preventDefault();
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * duration;

    if (isDraggingStartRef.current) {
      const maxStart = trimEnd !== null ? trimEnd - 0.5 : duration - 0.5;
      const newStart = Math.max(0, Math.min(newTime, maxStart));
      setTrimStart(newStart);
      if (onTrimChange && trimEnd !== null) {
        onTrimChange(newStart, trimEnd);
      }
    } else if (isDraggingEndRef.current) {
      const minEnd = trimStart + 0.5;
      const newEnd = Math.max(minEnd, Math.min(newTime, duration));
      setTrimEnd(newEnd);
      if (onTrimChange) {
        onTrimChange(trimStart, newEnd);
      }
    }
  }, [trimStart, trimEnd, duration, onTrimChange]);

  const handleMouseUp = useCallback(() => {
    // ВСЕГДА сбрасываем флаги при mouseup, независимо от условий
    console.log('MOUSE UP - resetting flags. Was draggingStart:', isDraggingStartRef.current, 'Was draggingEnd:', isDraggingEndRef.current);
    isDraggingStartRef.current = false;
    isDraggingEndRef.current = false;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDraggingStartRef.current && !isDraggingEndRef.current) return;
    if (!timelineRef.current || !e.touches[0]) return;

    e.preventDefault();
    const touch = e.touches[0];
    const rect = timelineRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * duration;

    if (isDraggingStartRef.current) {
      const maxStart = trimEnd !== null ? trimEnd - 0.5 : duration - 0.5;
      const newStart = Math.max(0, Math.min(newTime, maxStart));
      setTrimStart(newStart);
      if (onTrimChange && trimEnd !== null) {
        onTrimChange(newStart, trimEnd);
      }
    } else if (isDraggingEndRef.current) {
      const minEnd = trimStart + 0.5;
      const newEnd = Math.max(minEnd, Math.min(newTime, duration));
      setTrimEnd(newEnd);
      if (onTrimChange) {
        onTrimChange(trimStart, newEnd);
      }
    }
  }, [trimStart, trimEnd, duration, onTrimChange]);

  const handleTouchEnd = useCallback(() => {
    // ВСЕГДА сбрасываем флаги при touchend
    isDraggingStartRef.current = false;
    isDraggingEndRef.current = false;
  }, []);

  useEffect(() => {
    // Добавляем слушатели на window вместо document - window не блокируется
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp, true); // true = capture phase - ловим раньше всех
    window.addEventListener('blur', handleMouseUp); // На случай потери фокуса окна
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, true);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp, true);
      window.removeEventListener('blur', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd, true);
    };
  }, [handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  const getPercentage = (time: number): number => {
    return duration > 0 ? (time / duration) * 100 : 0;
  };

  return (
    <div className="w-full bg-white rounded-lg shadow-md p-4">
      {/* Header с кнопкой сворачивания */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Video Preview & Trim</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetTrim}
            disabled={isLoading || (!duration && !maxDuration)}
            className="px-2 py-1 text-xs border border-gray-200 rounded text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Сбросить обрезку до 0 и длины шортса"
          >
            ↺ Сбросить
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-500 hover:text-gray-700 transition-colors p-1"
            title={isExpanded ? "Свернуть" : "Развернуть"}
          >
            <svg
              className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Video Element - всегда видим */}
      <div className="mb-3">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full rounded-md bg-black"
          style={{ maxHeight: '300px' }}
          preload="metadata"
        />

        {isLoading && (
          <div className="text-center text-sm text-gray-500 mt-2">
            Loading video...
          </div>
        )}
      </div>

      {/* Timeline - всегда видим */}
      {!isLoading && (
        <div className="mb-3">
          <div
            ref={timelineRef}
            onClick={handleTimelineClick}
            className="relative h-12 bg-gray-200 rounded-md cursor-pointer overflow-hidden"
          >
            {/* Progress bar */}
            <div
              className="absolute top-0 left-0 h-full bg-blue-300 opacity-50"
              style={{ width: `${getPercentage(currentTime)}%` }}
            />

            {/* Trim region */}
            <div
              className="absolute top-0 h-full bg-green-400 opacity-40 border-l-2 border-r-2 border-green-600"
              style={{
                left: `${getPercentage(trimStart)}%`,
                width: `${getPercentage((trimEnd || duration) - trimStart)}%`,
              }}
            />

            {/* Start marker */}
            <div
              className="absolute top-0 h-full w-3 bg-green-600 cursor-ew-resize hover:bg-green-700 flex items-center justify-center touch-none"
              style={{ left: `${getPercentage(trimStart)}%`, transform: 'translateX(-50%)' }}
              onMouseDown={handleStartDrag}
              onTouchStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
                isDraggingStartRef.current = true;
              }}
            >
              <div className="w-0.5 h-6 bg-white" />
            </div>

            {/* End marker */}
            <div
              className="absolute top-0 h-full w-3 bg-green-600 cursor-ew-resize hover:bg-green-700 flex items-center justify-center touch-none"
              style={{ left: `${getPercentage(trimEnd || duration)}%`, transform: 'translateX(-50%)' }}
              onMouseDown={handleEndDrag}
              onTouchStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
                isDraggingEndRef.current = true;
              }}
            >
              <div className="w-0.5 h-6 bg-white" />
            </div>

            {/* Current time indicator */}
            <div
              className="absolute top-0 h-full w-0.5 bg-red-500"
              style={{ left: `${getPercentage(currentTime)}%` }}
            />
          </div>
        </div>
      )}

      {/* Компактная информация в свернутом виде */}
      {!isLoading && !isExpanded && (
        <div className="flex items-center justify-between text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePlayPause}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              title={isPlaying ? "Пауза" : "Воспроизвести"}
            >
              {isPlaying ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>
          <div className="text-green-700 font-medium">
            ✂️ {formatTime(trimStart)} - {trimEnd !== null ? formatTime(trimEnd) : '--:--'}
          </div>
        </div>
      )}

      {/* Развернутые контролы */}
      {!isLoading && isExpanded && (
        <div className="space-y-3">
          {/* Play/Pause buttons */}
          <div className="flex gap-2">
            <button
              onClick={handlePlayPause}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors flex items-center gap-2"
            >
              {isPlaying ? (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Pause
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  Play
                </>
              )}
            </button>

            <button
              onClick={handleStop}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
              </svg>
              Stop
            </button>

            <button
              onClick={handlePlayRegion}
              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              Play Selected
            </button>
          </div>

          {/* Time info */}
          <div className="flex justify-between text-sm text-gray-600">
            <div>
              <span className="font-medium">Current:</span> {formatTime(currentTime)}
            </div>
            <div>
              <span className="font-medium">Duration:</span> {formatTime(duration)}
            </div>
          </div>

          {/* Trim info */}
          <div className="bg-green-50 border border-green-200 rounded-md p-3">
            <div className="text-sm font-semibold text-green-800 mb-2">
              Trim Selection
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-600">Start:</span>
                <span className="ml-2 font-medium text-green-700">{formatTime(trimStart)}</span>
              </div>
              <div>
                <span className="text-gray-600">End:</span>
                <span className="ml-2 font-medium text-green-700">
                  {trimEnd !== null ? formatTime(trimEnd) : '--:--'}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-600">Selected Duration:</span>
                <span className="ml-2 font-medium text-green-700">
                  {trimEnd !== null ? formatTime(trimEnd - trimStart) : '--:--'}
                </span>
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              💡 Drag the green markers on timeline to trim video. Only the selected part will be used.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
