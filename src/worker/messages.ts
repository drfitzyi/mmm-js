// Message protocol between the main thread and the DSP worker.
import type { WatermarkAnalysis } from '../dsp/watermark';
import type { SpectralSettings } from '../modes';

export interface CleanRequest {
  id: number;
  type: 'clean';
  /** WAV bytes (transferred). */
  wav: ArrayBuffer;
  settings: SpectralSettings;
  seed?: number;
}

export interface AnalyzeRequest {
  id: number;
  type: 'analyze';
  wav: ArrayBuffer;
}

export type DspRequest = CleanRequest | AnalyzeRequest;

export interface ProgressMessage {
  id: number;
  type: 'progress';
  ratio: number;
}

export interface CleanResult {
  id: number;
  type: 'clean-result';
  /** Cleaned WAV bytes (transferred back). */
  wav: ArrayBuffer;
}

export interface AnalyzeResult {
  id: number;
  type: 'analyze-result';
  analyses: WatermarkAnalysis[];
}

export interface ErrorMessage {
  id: number;
  type: 'error';
  message: string;
}

export type DspResponse = ProgressMessage | CleanResult | AnalyzeResult | ErrorMessage;
