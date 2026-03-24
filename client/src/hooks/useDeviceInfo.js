/**
 * useDeviceInfo — Collects device and network information.
 *
 * Data sources:
 * - navigator.mediaDevices.enumerateDevices() — camera/mic names
 * - navigator.connection (Network Information API) — connection type, downlink, RTT
 * - MediaStreamTrack.getSettings() — actual camera resolution, frame rate, device ID
 * - navigator.getBattery() — battery level and charging status
 *
 * Browser support varies:
 * - enumerateDevices: all modern browsers
 * - navigator.connection: Chrome/Edge/Opera (not Safari/Firefox)
 * - getBattery: Chrome/Edge (not Safari/Firefox)
 */

import { useState, useEffect, useCallback, useRef } from "react";

export function useDeviceInfo(localStreamRef) {
  const [deviceInfo, setDeviceInfo] = useState(null);
  const prevRef = useRef(null);

  const collect = useCallback(async () => {
    const info = {};

    // ── Active camera and mic from the local stream tracks ──
    const stream = localStreamRef?.current;
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      if (videoTrack) {
        const settings = videoTrack.getSettings();
        info.cameraLabel = videoTrack.label || "Unknown camera";
        info.cameraResolution = settings.width && settings.height
          ? `${settings.width}x${settings.height}`
          : null;
        info.cameraFrameRate = settings.frameRate
          ? Math.round(settings.frameRate)
          : null;
        info.cameraFacingMode = settings.facingMode || null;
      } else {
        info.cameraLabel = "Camera off";
        info.cameraResolution = null;
        info.cameraFrameRate = null;
        info.cameraFacingMode = null;
      }

      if (audioTrack) {
        const settings = audioTrack.getSettings();
        info.micLabel = audioTrack.label || "Unknown microphone";
        info.micSampleRate = settings.sampleRate || null;
        info.micChannels = settings.channelCount || null;
        info.micEchoCancellation = settings.echoCancellation ?? null;
        info.micNoiseSuppression = settings.noiseSuppression ?? null;
        info.micAutoGainControl = settings.autoGainControl ?? null;
      } else {
        info.micLabel = "Microphone off";
        info.micSampleRate = null;
        info.micChannels = null;
      }
    }

    // ── Network Information API ──
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      info.networkType = conn.effectiveType || null; // "4g", "3g", "2g", "slow-2g"
      info.networkDownlink = conn.downlink ?? null; // Mbps estimate
      info.networkRtt = conn.rtt ?? null; // ms estimate from network layer
      info.networkSaveData = conn.saveData ?? false;
      info.connectionType = conn.type || null; // "wifi", "cellular", "ethernet", etc.
    } else {
      info.networkType = null;
      info.networkDownlink = null;
      info.networkRtt = null;
      info.networkSaveData = false;
      info.connectionType = null;
    }

    // ── Online status ──
    info.isOnline = navigator.onLine;

    // ── Battery (if available) ──
    try {
      if (navigator.getBattery) {
        const battery = await navigator.getBattery();
        info.batteryLevel = Math.round(battery.level * 100);
        info.batteryCharging = battery.charging;
      } else {
        info.batteryLevel = null;
        info.batteryCharging = null;
      }
    } catch {
      info.batteryLevel = null;
      info.batteryCharging = null;
    }

    // ── Platform ──
    info.platform = navigator.userAgentData?.platform || navigator.platform || null;
    info.hardwareConcurrency = navigator.hardwareConcurrency || null;
    info.deviceMemory = navigator.deviceMemory || null; // GB (Chrome only)

    // ── Performance memory (Chrome only) ──
    if (performance.memory) {
      info.jsHeapUsed = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024); // MB
      info.jsHeapTotal = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024);
    } else {
      info.jsHeapUsed = null;
      info.jsHeapTotal = null;
    }

    setDeviceInfo(info);
  }, [localStreamRef]);

  // Poll every 3 seconds (network/battery can change)
  useEffect(() => {
    collect();
    const interval = setInterval(collect, 3000);
    return () => clearInterval(interval);
  }, [collect]);

  // Listen for online/offline events
  useEffect(() => {
    const handler = () => collect();
    window.addEventListener("online", handler);
    window.addEventListener("offline", handler);
    return () => {
      window.removeEventListener("online", handler);
      window.removeEventListener("offline", handler);
    };
  }, [collect]);

  return deviceInfo;
}
