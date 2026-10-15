import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
  Upload,
  Loader2,
  X,
  AlertCircle,
  Sparkles,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import { TaskItem } from '../types';
import { normalizeTimeString, computeEndTime } from '../utils/localParser';

interface VisionScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApproveTasks: (tasks: TaskItem[], imagePreview?: string) => void;
  onSendToApprovalCard: (tasks: TaskItem[], inputSummary: string) => void;
}

/**
 * Resizes photos/screenshots to a max dimension of 2048px and re-encodes them as JPEG.
 * PNG screenshots used to be sent as PNG (several MB in base64, close to the serverless body limit);
 * JPEG at q=0.85 keeps calendar text legible at a fraction of the size.
 */
const MAX_IMAGE_DIM = 2048;
const JPEG_QUALITY = 0.85;

async function decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Fall back to <img> decoding (older Safari, unusual formats)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw new Error('Error al cargar la imagen');
  }
}

async function processImageFile(file: File): Promise<{ base64: string; mimeType: string }> {
  const { source, width: srcW, height: srcH, release } = await decodeImage(file);
  try {
    const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(srcW, srcH));
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Error al procesar la imagen');
    }
    // Transparent PNG areas would turn black in JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    const base64 = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    canvas.width = 0;
    canvas.height = 0;
    return { base64, mimeType: 'image/jpeg' };
  } finally {
    release();
  }
}

export const VisionScannerModal: React.FC<VisionScannerModalProps> = ({
  isOpen,
  onClose,
  onSendToApprovalCard,
}) => {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [progressText, setProgressText] = useState<string>('Analizando imagen...');
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressIntervalRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Reset state when opened or closed
  useEffect(() => {
    if (isOpen) {
      setStatus('idle');
      setErrorMessage('');
      setProgress(0);
      setProgressText('Analizando imagen...');
    } else {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    }
  }, [isOpen]);

  const handleStartScanning = async (file: File) => {
    if (!file || !file.type.startsWith('image/')) {
      setStatus('error');
      setErrorMessage('Por favor, selecciona un archivo de imagen válido (PNG, JPG o WEBP).');
      return;
    }

    setStatus('scanning');
    setProgress(12);
    setProgressText('Preparando captura de pantalla...');

    // Smooth progress simulation while backend processes the image
    let currentProgress = 12;
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

    progressIntervalRef.current = setInterval(() => {
      if (currentProgress < 88) {
        currentProgress += Math.floor(Math.random() * 8) + 4;
        setProgress(Math.min(currentProgress, 88));

        if (currentProgress > 30 && currentProgress <= 60) {
          setProgressText('Detectando eventos y cuadrícula del calendario...');
        } else if (currentProgress > 60) {
          setProgressText('Extrayendo fechas, horas y asignaturas...');
        }
      }
    }, 450);

    try {
      abortControllerRef.current = new AbortController();

      // Process and compress image if needed
      const { base64, mimeType } = await processImageFile(file);

      const response = await fetch('/api/parse-multimodal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          type: 'vision',
          imageBase64: base64,
          mimeType,
        }),
      });

      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            'No se pudieron detectar actividades en la imagen. Asegúrate de que la captura de tu calendario sea nítida y legible.'
        );
      }

      const data = await response.json();
      const rawTasks: TaskItem[] = data.extractedTasks || [];

      if (!rawTasks || rawTasks.length === 0) {
        throw new Error(
          'No se encontraron eventos o actividades legibles en la imagen. Prueba a subir una captura más clara o con mayor resolución.'
        );
      }

      setProgress(100);
      setProgressText(`¡Listo! Se encontraron ${rawTasks.length} actividades.`);

      // Format extracted tasks
      const formattedTasks: TaskItem[] = rawTasks.map((t, idx) => {
        const time = normalizeTimeString(t.time, '12:00');
        const durationMinutes = Number(t.durationMinutes) || 60;
        const endTime = t.endTime
          ? normalizeTimeString(t.endTime)
          : computeEndTime(time, durationMinutes);

        return {
          ...t,
          id: t.id || `vision-${Date.now()}-${idx}`,
          sourceType: 'vision',
          time,
          endTime,
          durationMinutes,
        };
      });

      // Brief delay to allow the user to see 100% completion before opening the approval card
      setTimeout(() => {
        onClose();
        onSendToApprovalCard(
          formattedTasks,
          `Captura de calendario (${formattedTasks.length} actividades detectadas)`
        );
      }, 350);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Error procesando imagen de calendario:', err);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      setStatus('error');
      setErrorMessage(
        err.message ||
          'No fue posible procesar la imagen. Verifica que la foto de tu calendario tenga buena iluminación y los textos sean legibles.'
      );
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleStartScanning(file);
    }
    // Reset file input value so user can select the same file again if desired
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleStartScanning(file);
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    setStatus('idle');
    setProgress(0);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm pt-[max(env(safe-area-inset-top,0px),1rem)] pb-[max(env(safe-area-inset-bottom,0px),1rem)] overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.18 }}
          className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[92dvh] flex flex-col"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-100 text-sm sm:text-base">
                  Escanear Calendario
                </h3>
                <p className="text-xs text-slate-400">
                  Capturas de Google Calendar, horarios o agendas
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer flex items-center justify-center touch-manipulation"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 sm:p-6 overflow-y-auto">
            {/* STATE 1: IDLE / UPLOAD */}
            {status === 'idle' && (
              <div className="flex flex-col items-center">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full p-6 sm:p-8 rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition ${
                    isDragOver
                      ? 'border-cyan-500 bg-cyan-500/5'
                      : 'border-slate-750 bg-slate-950/40 hover:border-slate-600 hover:bg-slate-850/40'
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-cyan-400 mb-3 shadow-inner">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-medium text-slate-200 mb-1">
                    Selecciona o arrastra una captura de tu calendario
                  </p>
                  <p className="text-xs text-slate-400 max-w-xs mb-4">
                    Soporta Google Calendar, Apple Calendar, Outlook, fotos de horarios y agendas
                  </p>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-600/20 transition cursor-pointer"
                  >
                    Elegir imagen de calendario
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>
            )}

            {/* STATE 2: SCANNING (Clean Progress Bar and Spinning Wheel) */}
            {status === 'scanning' && (
              <div className="flex flex-col items-center py-4 px-2 text-center">
                {/* Rueda de carga (Spinner) */}
                <div className="relative mb-5 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full border-2 border-slate-800 border-t-cyan-500 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-cyan-400" />
                  </div>
                </div>

                <h4 className="text-sm sm:text-base font-semibold text-slate-100 mb-1.5">
                  Procesando calendario
                </h4>
                <p className="text-xs text-slate-400 mb-5 min-h-[1.25rem]">
                  {progressText}
                </p>

                {/* Barra de carga (Progress Bar) */}
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mb-2">
                  <motion.div
                    className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full"
                    initial={{ width: '10%' }}
                    animate={{ width: `${progress}%` }}
                    transition={{ ease: 'easeOut', duration: 0.3 }}
                  />
                </div>

                <div className="w-full flex items-center justify-between text-[11px] text-slate-400 mb-5 font-mono">
                  <span>Reconocimiento óptico</span>
                  <span>{progress}%</span>
                </div>

                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-3.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            )}

            {/* STATE 3: ERROR */}
            {status === 'error' && (
              <div className="flex flex-col items-center py-3 text-center">
                <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-3">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-slate-100 mb-1.5">
                  No se detectaron actividades
                </h4>
                <p className="text-xs text-slate-400 max-w-xs mb-5 leading-relaxed">
                  {errorMessage ||
                    'Asegúrate de que la captura de tu calendario muestre claramente los bloques con sus nombres y horarios.'}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStatus('idle');
                      setTimeout(() => fileInputRef.current?.click(), 100);
                    }}
                    className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    Intentar con otra foto
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
