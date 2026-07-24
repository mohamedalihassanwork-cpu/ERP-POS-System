/**
 * barcode-input.ts
 *
 * Utility for discriminating between barcode scanner input and human keyboard
 * input in the POS search field.
 *
 * ## The Problem
 * Barcode scanners behave like keyboards — they inject characters at the OS
 * level. When the Windows keyboard layout is set to Arabic, every key the
 * scanner "presses" is translated by the OS to an Arabic character before the
 * browser ever sees it. Result: a barcode like "6223001234567" arrives as a
 * string of Arabic letters and Arabic-Indic digits.
 *
 * The previous fix applied normalizeBarcodeInput() to every onChange event,
 * which correctly fixed scanners but broke human Arabic typing (Arabic search
 * terms were silently converted to meaningless English strings).
 *
 * ## The Solution — Timing-Based Discrimination
 * Barcode scanners inject characters extremely fast (typically < 30 ms between
 * characters, usually < 10 ms). Humans type much slower (typically > 100 ms,
 * often > 200 ms between keystrokes).
 *
 * useBarcodeInput() tracks the time of the last keydown event. If two
 * consecutive keydowns occur within SCANNER_THRESHOLD_MS, the input is assumed
 * to be coming from a scanner, and the accumulated value is fully normalized
 * once the scanner "pauses" (i.e., when no new key arrives within
 * SCANNER_SETTLE_MS).
 *
 * During human typing the inter-key gap exceeds SCANNER_THRESHOLD_MS, so
 * normalization is never applied and Arabic text passes through unchanged.
 *
 * ## API
 *
 *   const { value, onChange, onKeyDown, reset } = useBarcodeInput({
 *     onScan: (normalizedBarcode) => { ... }
 *   });
 *
 * For a simpler controlled-input approach (no callback):
 *
 *   <input
 *     value={value}
 *     onChange={onChange}
 *     onKeyDown={onKeyDown}
 *   />
 */

import { useCallback, useRef, useState } from "react";

// ── Arabic-to-English character map ──────────────────────────────────────────
// Key   = Arabic character produced by an Arabic keyboard layout.
// Value = English character at the same physical key position.
const ARABIC_TO_ENGLISH: Record<string, string> = {
  // Arabic-Indic digits → Western Arabic digits
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",

  // Top row (Q → P)
  "ض": "q", "ص": "w", "ث": "e", "ق": "r", "ف": "t",
  "غ": "y", "ع": "u", "ه": "i", "خ": "o", "ح": "p",
  "ج": "[", "د": "]",

  // Home row (A → L)
  "ش": "a", "س": "s", "ي": "d", "ب": "f", "ل": "g",
  "ا": "h", "ت": "j", "ن": "k", "م": "l",

  // Bottom row (Z → M)
  "ئ": "z", "ء": "x", "ؤ": "c", "ر": "v",
  "ى": "n", "ة": "m",

  // Punctuation used in some barcode formats
  "و": ",", "ز": ".", "ظ": "/",
};

/**
 * Converts every Arabic keyboard-layout character in `value` to its English
 * equivalent. Non-mapped characters pass through unchanged.
 *
 * Use this ONLY on confirmed scanner input, not on user-typed text.
 */
export function normalizeBarcodeInput(value: string): string {
  if (!value) return value;
  let changed = false;
  const result = value
    .split("")
    .map((ch) => {
      const mapped = ARABIC_TO_ENGLISH[ch];
      if (mapped !== undefined) {
        changed = true;
        return mapped;
      }
      return ch;
    })
    .join("");
  return changed ? result : value; // return original reference if nothing changed
}

// ── Timing constants ──────────────────────────────────────────────────────────

/**
 * Maximum inter-key delay (ms) for input to be classified as a barcode scanner.
 * Scanners inject characters < 30 ms apart; this threshold gives headroom.
 */
const SCANNER_THRESHOLD_MS = 60;

/**
 * After the last key arrives, wait this long before considering the scan
 * complete and applying normalization (scanners end with an Enter/newline, but
 * we also handle the case where Enter is swallowed).
 */
const SCANNER_SETTLE_MS = 120;

// ── useBarcodeInput hook ─────────────────────────────────────────────────────

interface UseBarcodeInputOptions {
  /**
   * Called when the hook determines that a full barcode was scanned.
   * The value has already been normalized to English.
   * The input is NOT automatically cleared — the caller decides what to do.
   */
  onScan?: (barcode: string) => void;
}

interface UseBarcodeInputReturn {
  /** Current controlled input value. */
  value: string;
  /** Attach to the input's onChange. */
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Attach to the input's onKeyDown to intercept Enter from the scanner. */
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Programmatically reset the value (e.g., after adding to cart). */
  reset: () => void;
  /** Whether the last burst of input was detected as scanner input. */
  isScannerMode: boolean;
}

/**
 * Hook that manages a POS search input supporting both:
 *  - Arabic human typing (passes through unchanged)
 *  - Barcode scanner input (normalizes Arabic keyboard-layout to English)
 *
 * @example
 * ```tsx
 * const { value, onChange, onKeyDown, reset } = useBarcodeInput({
 *   onScan: (barcode) => handleBarcode(barcode),
 * });
 *
 * <input value={value} onChange={onChange} onKeyDown={onKeyDown} />
 * ```
 */
export function useBarcodeInput(
  options: UseBarcodeInputOptions = {}
): UseBarcodeInputReturn {
  const { onScan } = options;

  const [value, setValue] = useState("");
  const [isScannerMode, setIsScannerMode] = useState(false);

  // Tracks the timestamp of the last keydown event
  const lastKeyTimeRef = useRef<number>(0);
  // Consecutive fast-key counter: incremented on each sub-threshold keydown
  const fastKeyCountRef = useRef<number>(0);
  // Timer to detect the end of a scanner burst (settle timeout)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current !== null) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const now = Date.now();
      const gap = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === "Enter") {
        // Scanner sends Enter at the end of the barcode.
        // If we are in scanner mode, consume Enter and fire onScan.
        if (fastKeyCountRef.current >= 3) {
          e.preventDefault();
          const normalized = normalizeBarcodeInput(e.currentTarget.value);
          setIsScannerMode(false);
          fastKeyCountRef.current = 0;
          clearSettleTimer();
          if (onScan) {
            onScan(normalized);
          }
        }
        return;
      }

      if (gap <= SCANNER_THRESHOLD_MS) {
        fastKeyCountRef.current += 1;

        // Start/reset the settle timer
        clearSettleTimer();
        settleTimerRef.current = setTimeout(() => {
          // Settle: if we accumulated enough fast keys, normalize the value
          if (fastKeyCountRef.current >= 3) {
            setValue((prev) => {
              const normalized = normalizeBarcodeInput(prev);
              if (onScan && normalized !== prev) {
                // defer the callback slightly so React finishes this render
                setTimeout(() => onScan(normalized), 0);
              }
              return normalized;
            });
          }
          fastKeyCountRef.current = 0;
          setIsScannerMode(false);
        }, SCANNER_SETTLE_MS);

        setIsScannerMode(true);
      } else {
        // Human keystroke: gap is large, reset fast-key counter
        fastKeyCountRef.current = 0;
        clearSettleTimer();
        setIsScannerMode(false);
      }
    },
    [onScan, clearSettleTimer]
  );

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Always accept the raw value from the input.
    // Normalization is applied lazily once we detect a scanner burst via the
    // settle timeout or Enter key, NOT on every keystroke.
    setValue(e.target.value);
  }, []);

  const reset = useCallback(() => {
    setValue("");
    fastKeyCountRef.current = 0;
    setIsScannerMode(false);
    clearSettleTimer();
  }, [clearSettleTimer]);

  return { value, onChange, onKeyDown, reset, isScannerMode };
}
