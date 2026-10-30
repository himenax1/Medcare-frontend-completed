"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";


const K_SHA256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function fastSha256Hex(ascii: string): string {
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const strLen = ascii.length;
  const bitLen = strLen * 8;
  const wordCount = (((strLen + 8) >> 6) + 1) << 4;
  const words = new Int32Array(wordCount);

  for (let i = 0; i < strLen; i++) {
    words[i >> 2] |= ascii.charCodeAt(i) << (24 - (i % 4) * 8);
  }
  words[strLen >> 2] |= 0x80 << (24 - (strLen % 4) * 8);
  words[wordCount - 1] = bitLen;

  const w = new Int32Array(64);
  for (let j = 0; j < wordCount; j += 16) {
    for (let i = 0; i < 16; i++) w[i] = words[j + i];
    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
      const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K_SHA256[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  return (h0 >>> 0).toString(16).padStart(8, "0") +
         (h1 >>> 0).toString(16).padStart(8, "0") +
         (h2 >>> 0).toString(16).padStart(8, "0") +
         (h3 >>> 0).toString(16).padStart(8, "0");
}


let isProxyPatched = false;
function installMobileNetworkBridge() {
  if (typeof window === "undefined" || isProxyPatched) return;
  isProxyPatched = true;

  const rewriteUrl = (url: string) => {
    if (!url) return url;
    return url.replace(/^https?:\/\/(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+):8000/, "/api-proxy");
  };

  axios.interceptors.request.use((config) => {
    if (config.url) config.url = rewriteUrl(config.url);
    return config;
  });

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string") return origFetch(rewriteUrl(input), init);
    return origFetch(input, init);
  };
}

export function useSmartShield() {
  const [powData, setPowData] = useState({ nonce: "", solution: "", isReady: false });

  // Telemetry Refs
  const mountTimeRef = useRef<number>(0);
  const lastPointRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const speedsRef = useRef<number[]>([]);
  const anglesRef = useRef<number[]>([]);
  const downTimeRef = useRef<number | null>(null);
  const tapDurationsRef = useRef<number[]>([]);
  const keyTimesRef = useRef<number[]>([]);
  const keyIntervalsRef = useRef<number[]>([]);
  const trustedCountRef = useRef<{ trusted: number; total: number }>({ trusted: 0, total: 0 });
  const detectedModalityRef = useRef<number | null>(null);
  const manualCharCountRef = useRef<number>(0);
  const bulkInsertCountRef = useRef<number>(0);

  
  const getApiBaseUrl = useCallback(() => {
    return "/api-proxy";
  }, []);

  const getDeviceModality = () => {
    if (detectedModalityRef.current !== null) return detectedModalityRef.current;
    if (typeof window === "undefined") return 0;
    const isCoarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    return isCoarsePointer ? 1 : 0;
  };

  const resetTelemetry = useCallback(() => {
    mountTimeRef.current = performance.now();
    lastPointRef.current = null;
    speedsRef.current = [];
    anglesRef.current = [];
    downTimeRef.current = null;
    tapDurationsRef.current = [];
    keyTimesRef.current = [];
    keyIntervalsRef.current = [];
    trustedCountRef.current = { trusted: 0, total: 0 };
    manualCharCountRef.current = 0;
    bulkInsertCountRef.current = 0;
  }, []);

  const initChallenge = useCallback(async () => {
    try {
      installMobileNetworkBridge();
      setPowData({ nonce: "", solution: "", isReady: false });

      
      const res = await fetch("/api-proxy/auth/challenge");

      if (!res.ok) {
        setTimeout(initChallenge, 2000);
        return;
      }

      const { nonce, difficulty } = await res.json();
      const targetPrefix = difficulty || "0000";

      let solution = 0;
      const solveChunk = () => {
        const chunkEnd = solution + 3000;
        while (solution < chunkEnd) {
          const hashPrefix = fastSha256Hex(nonce + solution.toString());
          if (hashPrefix.startsWith(targetPrefix)) {
            setPowData({
              nonce: nonce,
              solution: solution.toString(),
              isReady: true,
            });
            return;
          }
          solution++;
        }
        setTimeout(solveChunk, 0);
      };

      setTimeout(solveChunk, 0);
    } catch (err) {
      console.error("SmartShield Challenge Error:", err);
      setTimeout(initChallenge, 2000);
    }
  }, []);

  useEffect(() => {
    installMobileNetworkBridge();
    resetTelemetry();
    initChallenge();

    const refreshTimer = setInterval(() => initChallenge(), 240000);

    const recordTrust = (e: Event) => {
      trustedCountRef.current.total += 1;
      if (e.isTrusted) trustedCountRef.current.trusted += 1;
    };

    const recordPointKinematics = (x: number, y: number, minDeltaMs = 15) => {
      const now = performance.now();
      const prev = lastPointRef.current;
      if (prev && now - prev.time >= minDeltaMs) {
        const dx = x - prev.x, dy = y - prev.y, dt = now - prev.time;
        const dist = Math.hypot(dx, dy);
        if (dist > 0) {
          speedsRef.current.push(dist / dt);
          anglesRef.current.push(Math.atan2(dy, dx));
        }
        lastPointRef.current = { x, y, time: now };
      } else if (!prev) {
        lastPointRef.current = { x, y, time: now };
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      recordTrust(e);
      if (e.pointerType === "touch") detectedModalityRef.current = 1;
      else if (e.pointerType === "mouse") detectedModalityRef.current = 0;
      recordPointKinematics(e.clientX, e.clientY, 20);
    };

    const handlePointerDown = (e: PointerEvent) => {
      recordTrust(e);
      if (e.pointerType === "touch") detectedModalityRef.current = 1;
      else if (e.pointerType === "mouse") detectedModalityRef.current = 0;
      downTimeRef.current = performance.now();
      recordPointKinematics(e.clientX, e.clientY, 5);
    };

    const handlePointerUp = (e: PointerEvent) => {
      recordTrust(e);
      if (downTimeRef.current !== null) {
        const duration = performance.now() - downTimeRef.current;
        if (duration > 0 && duration < 2000) tapDurationsRef.current.push(duration);
        downTimeRef.current = null;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      recordTrust(e);
      if (e.repeat) return;
      const ignoredKeys = ["Tab", "Shift", "Control", "Alt", "Meta", "CapsLock", "Enter", "Backspace", "Unidentified"];
      if (ignoredKeys.includes(e.key)) return;

      const now = performance.now();
      if (keyTimesRef.current.length > 0) {
        const lastKeyTime = keyTimesRef.current[keyTimesRef.current.length - 1];
        const interval = now - lastKeyTime;
        if (interval >= 25 && interval < 3000) keyIntervalsRef.current.push(interval);
      }
      keyTimesRef.current.push(now);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    window.addEventListener("keydown", handleKeyDown, { passive: true });

    return () => {
      clearInterval(refreshTimer);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [initChallenge, resetTelemetry]);

  const checkAutofillOnInput = useCallback((e: React.FormEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const currentLen = el.value.length;
    const prevLen = parseInt(el.dataset.prevLen ?? "0", 10);
    const diff = currentLen - prevLen;
    el.dataset.prevLen = currentLen.toString();

    const nativeEvent = e.nativeEvent as InputEvent;
    const inputType = nativeEvent.inputType || "";

    if (currentLen === 0) {
      manualCharCountRef.current = 0;
      bulkInsertCountRef.current = 0;
      return;
    }

    if (diff > 2 || inputType === "insertFromPaste" || inputType === "insertReplacementText") {
      bulkInsertCountRef.current += 1;
    } else if (diff === 1 || inputType === "insertText" || inputType === "insertCompositionText") {
      manualCharCountRef.current += 1;

      if (detectedModalityRef.current === 1) {
        const now = performance.now();
        if (keyTimesRef.current.length > 0) {
          const lastTime = keyTimesRef.current[keyTimesRef.current.length - 1];
          const interval = now - lastTime;
          if (interval >= 25 && interval < 3000) {
            keyIntervalsRef.current.push(interval);
          }
        }
        keyTimesRef.current.push(now);
      }
    }
  }, []);

  const getSecurityPayload = () => {
    const interactionTime = Math.round(performance.now() - mountTimeRef.current);
    const speeds = speedsRef.current;
    const meanSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0.0;

    const angles = anglesRef.current;
    let curveVariance = 0.0;
    if (angles.length > 2) {
      const meanAngle = angles.reduce((a, b) => a + b, 0) / angles.length;
      curveVariance = angles.reduce((acc, val) => acc + Math.pow(val - meanAngle, 2), 0) / angles.length;
    }

    const taps = tapDurationsRef.current;
    const meanTapDuration = taps.length > 0 ? taps.reduce((a, b) => a + b, 0) / taps.length : 0.0;

    const intervals = [...keyIntervalsRef.current].sort((a, b) => a - b);
    let medianKeyInterval = 0.0;
    if (intervals.length > 0) {
      const mid = Math.floor(intervals.length / 2);
      medianKeyInterval = intervals.length % 2 !== 0 ? intervals[mid] : (intervals[mid - 1] + intervals[mid]) / 2;
    }

    const { trusted, total } = trustedCountRef.current;
    const trustedRatio = total > 0 ? trusted / total : 0.0;
    const isPureAutofill = bulkInsertCountRef.current > 0 && manualCharCountRef.current < 4;

    return {
      nonce: powData.nonce,
      solution: powData.solution,
      has_behavioral_data: total > 0,
      is_autofill_detected: isPureAutofill,
      device_modality: getDeviceModality(),
      interaction_time_ms: Number(interactionTime.toFixed(2)),
      pointer_speed_mean: Number(meanSpeed.toFixed(4)),
      pointer_curve_variance: Number(curveVariance.toFixed(4)),
      tap_click_duration_ms: Number(meanTapDuration.toFixed(2)),
      key_interval_median_ms: Number(medianKeyInterval.toFixed(2)),
      trusted_event_ratio: Number(trustedRatio.toFixed(2)),
    };
  };

  const refreshAll = useCallback(() => {
    resetTelemetry();
    initChallenge();
  }, [resetTelemetry, initChallenge]);

  return {
    isPowReady: powData.isReady,
    checkAutofillOnInput,
    getSecurityPayload,
    refreshChallenge: refreshAll,
    getApiBaseUrl
  };
}