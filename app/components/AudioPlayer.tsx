'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';

interface AudioPlayerProps {
  audioUrl: string;
  onTrimChange?: (startTime: number, endTime: number) => void;
  initialStartTime?: number;
  initialEndTime?: number;
  maxDuration?: number;
}

export default function AudioPlayer({
  audioUrl,
  onTrimChange,
  initialStartTime = 0,
  initialEndTime,
  maxDuration,
}: AudioPlayerProps) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<RegionsPlugin | null>(null);
  const onTrimChangeRef = useRef(onTrimChange);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [trimStart, setTrimStart] = useState(initialStartTime);
  const [trimEnd, setTrimEnd] = useState<number | null>(initialEndTime || null);
  const [isExpanded, setIsExpanded] = useState(false);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Обновляем ref при изменении onTrimChange
  useEffect(() => {
    onTrimChangeRef.current = onTrimChange;
  }, [onTrimChange]);

  useEffect(() => {
    if (!waveformRef.current || !audioUrl) return;

    // Очищаем предыдущий экземпляр WaveSurfer, если он есть
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
    }

    // Создаем RegionsPlugin
    const regions = RegionsPlugin.create();
    regionsPluginRef.current = regions;

    // Создаем WaveSurfer instance
    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#3b82f6',
      progressColor: '#1d4ed8',
      cursorColor: '#ef4444',
      barWidth: 2,
      barRadius: 3,
      cursorWidth: 2,
      height: 80,
      barGap: 2,
      normalize: true,
      plugins: [regions],
    });

    wavesurferRef.current = wavesurfer;

    // Проверяем, нужно ли проксировать URL (если это внешний URL)
    const isExternalUrl = audioUrl.startsWith('http://') || audioUrl.startsWith('https://');

    let urlToLoad = audioUrl;

    // Если это внешний URL (не локальный), проксируем через наш API
    if (isExternalUrl && !audioUrl.includes(window.location.hostname)) {
      // Передаем URL как есть - сервер попробует оба варианта (с кодированием и без)
      urlToLoad = `/api/proxy/audio?url=${encodeURIComponent(audioUrl)}`;
      console.log('Proxying external audio through:', urlToLoad);
    }

    // Обработчик ошибок (добавляем перед загрузкой)
    wavesurfer.on('error', (error) => {
      // Игнорируем AbortError, так как это нормальное поведение при смене URL или размонтировании
      if (error.name === 'AbortError') {
        console.log('Audio loading was cancelled (this is normal)');
        return;
      }
      console.error('WaveSurfer error:', error);
    });

    // Загружаем аудио
    wavesurfer.load(urlToLoad);

    // События
    wavesurfer.on('ready', () => {
      setIsLoading(false);
      const audioDuration = wavesurfer.getDuration();
      setDuration(audioDuration);

      // Устанавливаем начальную область обрезки
      const endTime = initialEndTime || maxDuration || audioDuration;
      setTrimEnd(Math.min(endTime, audioDuration));

      // Создаем регион для обрезки
      const region = regions.addRegion({
        start: initialStartTime,
        end: Math.min(endTime, audioDuration),
        color: 'rgba(34, 197, 94, 0.3)',
        drag: true,
        resize: true,
      });

      console.log('Audio region created:', {
        id: region.id,
        start: region.start,
        end: region.end,
        drag: region.drag,
        resize: region.resize,
      });
    });

    wavesurfer.on('play', () => setIsPlaying(true));
    wavesurfer.on('pause', () => setIsPlaying(false));
    wavesurfer.on('timeupdate', (time) => setCurrentTime(time));

    // Обработчик клика по waveform - переходим к кликнутой позиции
    wavesurfer.on('click', (relativeX) => {
      const clickTime = relativeX * wavesurfer.getDuration();
      console.log('Waveform clicked at time:', clickTime);
      wavesurfer.setTime(clickTime);
    });

    // Обработка изменения региона
    regions.on('region-updated', (region) => {
      console.log('Audio region updated:', { start: region.start, end: region.end });
      setTrimStart(region.start);
      setTrimEnd(region.end);
      if (onTrimChangeRef.current) {
        onTrimChangeRef.current(region.start, region.end);
      }
    });

    // Обработчик для начала обновления региона
    regions.on('region-update', (region) => {
      console.log('Audio region being dragged:', { start: region.start, end: region.end });
    });

    // Cleanup
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      wavesurfer.destroy();
    };
  }, [audioUrl, initialStartTime, initialEndTime, maxDuration]);

  // Обновляем регион при изменении maxDuration
  useEffect(() => {
    if (!wavesurferRef.current || !regionsPluginRef.current || !maxDuration || duration === 0) return;

    const regions = regionsPluginRef.current.getRegions();
    if (regions.length > 0) {
      const region = regions[0];
      const newEnd = Math.min(trimStart + maxDuration, duration);

      // Только обновляем регион WaveSurfer, не вызываем setState
      // setState будет вызван автоматически через событие 'region-updated'
      region.setOptions({ end: newEnd });
    }
  }, [maxDuration, duration, trimStart]);

  const handlePlayPause = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  const handleStop = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.stop();
      setCurrentTime(0);
    }
  };

  const handlePlayRegion = () => {
    if (!wavesurferRef.current || !regionsPluginRef.current) return;

    // Очищаем предыдущий интервал, если он есть
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }

    // Получаем актуальные значения региона напрямую из RegionsPlugin
    const regions = regionsPluginRef.current.getRegions();
    if (regions.length === 0) {
      console.warn('No region found to play');
      return;
    }

    const region = regions[0];
    const start = region.start;
    const end = region.end;

    console.log('Playing region:', { start, end });

    // Устанавливаем время и начинаем воспроизведение
    wavesurferRef.current.setTime(start);
    wavesurferRef.current.play();

    // Останавливаем воспроизведение в конце региона
    playIntervalRef.current = setInterval(() => {
      if (wavesurferRef.current) {
        const currentTime = wavesurferRef.current.getCurrentTime();
        if (currentTime >= end) {
          wavesurferRef.current.pause();
          if (playIntervalRef.current) {
            clearInterval(playIntervalRef.current);
            playIntervalRef.current = null;
          }
        }
      }
    }, 100);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  return (
    <div className="w-full bg-white rounded-lg shadow-md p-4">
      {/* Header с кнопкой сворачивания */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Audio Preview & Trim</h3>
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

      {/* Waveform - всегда видим */}
      <div className="mb-3">
        <div
          ref={waveformRef}
          className={`w-full rounded-md overflow-hidden bg-gray-100 ${isLoading ? 'animate-pulse' : ''}`}
        />

        {isLoading && (
          <div className="text-center text-sm text-gray-500 mt-2">
            Loading audio...
          </div>
        )}
      </div>

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
              💡 Drag the green region to trim audio. Only the selected part will be used in the video.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
