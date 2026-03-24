import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  Mic,
  Wifi,
  WifiOff,
  BatteryCharging,
  Battery,
  BatteryLow,
  Cpu,
  ChevronDown,
  ChevronRight,
  Info,
  X,
  Shield,
  Volume2,
} from "lucide-react";

/**
 * DeviceNetworkPanel — Shows real device hardware and network info.
 *
 * Separate from WebRTC stats — this shows what hardware you're using,
 * your network type and strength, battery status, and system resources.
 * All data comes from real browser APIs, nothing hardcoded.
 */

// ── Kid-friendly explanations ──

const INFO = {
  camera: {
    title: "Camera",
    text: "This is the name of the camera your computer is using for the video call. If you have a laptop, it's usually the built-in webcam. If you plugged in an external camera (like a USB webcam), it might show that instead. The browser picks the best available camera automatically.",
    example: "You might see 'FaceTime HD Camera' on a Mac, or 'Integrated Webcam' on a Windows laptop.",
  },
  cameraRes: {
    title: "Camera Resolution",
    text: "This is the actual size of the video your camera is capturing right now. It might be different from your camera's maximum resolution — the browser adjusts it based on your internet speed and CPU power to keep things smooth.",
    example: "1280x720 means your camera is capturing 720p HD video. If the browser lowers it to 640x480, it's saving bandwidth.",
  },
  cameraFps: {
    title: "Camera Frame Rate",
    text: "How many pictures per second your camera is actually capturing. This is the raw input — before the browser encodes and sends it. Your camera might capture at 30 FPS but the browser might only send 24 FPS if your internet is slow.",
    example: "Most webcams capture at 30 FPS. Some gaming cameras can do 60 FPS.",
  },
  microphone: {
    title: "Microphone",
    text: "The name of the microphone picking up your voice. Laptops have built-in mics, but you might also have headphone mics or USB microphones plugged in. The browser usually picks the default system microphone.",
    example: "You might see 'MacBook Pro Microphone', 'Default - Headset', or 'Blue Yeti' if you have an external mic.",
  },
  echoCancellation: {
    title: "Echo Cancellation",
    text: "When your speakers play the other person's voice, your microphone can pick it up and send it back — creating an annoying echo! Echo cancellation is a smart filter that removes this echo. It listens to what's playing through your speakers and subtracts it from your microphone input.",
    example: "Without echo cancellation, the other person would hear their own voice coming back at them with a slight delay — very distracting!",
  },
  noiseSuppression: {
    title: "Noise Suppression",
    text: "This filter removes background noise from your microphone — things like keyboard typing, fan humming, dogs barking, or traffic outside. It tries to keep just your voice and cut out everything else. It's like having a smart assistant that mutes all the annoying sounds around you.",
    example: "If you're typing while talking, noise suppression stops the other person from hearing loud click-click-click of your keyboard.",
  },
  networkType: {
    title: "Network Type",
    text: "This tells you what kind of internet connection you're on. '4g' means fast mobile data. 'wifi' means you're on a wireless network. 'ethernet' means a wired cable connection (usually the fastest and most stable). The type affects how much data you can send and how stable your connection is.",
    example: "'4g' is good for video calls. '3g' might struggle. '2g' or 'slow-2g' means video will be very low quality or might not work.",
  },
  networkDownlink: {
    title: "Estimated Downlink Speed",
    text: "This is the browser's estimate of how fast your internet can download data, measured in megabits per second (Mbps). Think of it like the speed limit on a highway — it tells you how fast data CAN travel, not necessarily how fast it IS traveling right now.",
    example: "For a smooth 720p video call, you need at least 1.5 Mbps. For 1080p, about 3 Mbps. If this shows 0.5 Mbps, expect blurry video.",
  },
  networkRtt: {
    title: "Network Layer RTT",
    text: "This is a rough estimate of your network's round-trip time from the browser's Network Information API. It's different from the WebRTC RTT — this one measures general internet latency, not the specific path to the other person. Think of it as a 'general internet health check.'",
    example: "Under 100ms = good internet. 100-300ms = okay. Over 300ms = your internet might be struggling.",
  },
  batteryLevel: {
    title: "Battery Level",
    text: "How much battery your device has left. Video calls use a lot of power because your camera, microphone, screen, and internet connection are all active at once. If your battery gets very low, your device might start saving power by reducing performance — which could make the video choppier.",
    example: "Below 20%, some devices throttle CPU speed to save battery, which can affect video call quality.",
  },
  cpuCores: {
    title: "CPU Cores",
    text: "Your processor (CPU) has multiple 'cores' — each one can handle tasks independently. More cores means your computer can encode video, decode the other person's video, and run other apps all at the same time without slowing down. Video encoding is CPU-intensive work!",
    example: "4 cores is enough for a 1-on-1 video call. If you only have 2 cores and lots of browser tabs open, you might see 'quality limit: cpu' in the performance panel.",
  },
  memory: {
    title: "Device Memory",
    text: "How much RAM (Random Access Memory) your device has. RAM is like your desk — a bigger desk lets you spread out more papers (apps) at once. Video calls need RAM for storing video frames, audio buffers, and the WebRTC engine. If you're low on memory, things might slow down.",
    example: "4 GB is the minimum for comfortable video calling. 8 GB or more means you can have the call plus other apps open without problems.",
  },
  jsHeap: {
    title: "JavaScript Memory Usage",
    text: "This shows how much memory this web page (the video call app) is using. 'Used' is what's actively being used right now. 'Total' is what the browser has reserved. If 'Used' keeps growing without stopping, that could mean a memory leak — the app is holding onto data it doesn't need anymore.",
    example: "20-50 MB is normal for a video call app. If it grows to 200+ MB, something might be wrong.",
  },
};

// ── InfoPopover (reused pattern) ──

function InfoPopover({ infoKey, activePopover, setActivePopover }) {
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const isOpen = activePopover === infoKey;
  const info = INFO[infoKey];

  if (!info) return null;

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const popoverWidth = 288;
    let top = rect.top - 8;
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - 8) left = window.innerWidth - popoverWidth - 8;
    if (left < 8) left = 8;
    if (top < 200) top = rect.bottom + 8;
    setPos({ top, left });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const handleClick = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        buttonRef.current && !buttonRef.current.contains(e.target)
      ) {
        setActivePopover(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, setActivePopover, updatePosition]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); setActivePopover(isOpen ? null : infoKey); }}
        className="text-gray-600 hover:text-gray-400 transition-colors p-0.5"
      >
        <Info className="w-3 h-3" />
      </button>
      {isOpen && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] w-72 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-4"
          style={{ top: pos.top, left: pos.left, transform: "translateY(-100%)" }}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <h4 className="text-xs font-semibold text-white">{info.title}</h4>
            <button onClick={() => setActivePopover(null)} className="text-gray-500 hover:text-gray-300 shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-gray-300 leading-relaxed mb-2">{info.text}</p>
          <div className="bg-gray-900/50 rounded-lg px-3 py-2">
            <p className="text-[10px] text-blue-400 font-medium mb-0.5">Example</p>
            <p className="text-[11px] text-gray-400 leading-relaxed">{info.example}</p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── Helpers ──

function Row({ icon: Icon, label, value, color = "text-gray-300", infoKey, activePopover, setActivePopover }) {
  return (
    <div className="flex items-center justify-between gap-1 py-0.5">
      <div className="flex items-center gap-1.5">
        {infoKey && (
          <InfoPopover infoKey={infoKey} activePopover={activePopover} setActivePopover={setActivePopover} />
        )}
        {Icon && <Icon className="w-3 h-3 text-gray-500" />}
        <span className="text-gray-500 text-[11px]">{label}</span>
      </div>
      <span className={`text-[11px] font-mono ${color} text-right max-w-[180px] truncate`}>{value}</span>
    </div>
  );
}

function Section({ icon: Icon, title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-gray-800/30 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-800/50 transition-colors"
      >
        <Icon className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-[11px] font-medium text-gray-300 flex-1 text-left">{title}</span>
        {open ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
      </button>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  );
}

function BoolBadge({ value, trueLabel = "On", falseLabel = "Off" }) {
  if (value == null) return <span className="text-[11px] text-gray-600">N/A</span>;
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${value ? "bg-green-500/20 text-green-400" : "bg-gray-700 text-gray-500"}`}>
      {value ? trueLabel : falseLabel}
    </span>
  );
}

function BatteryIcon({ level, charging }) {
  if (charging) return <BatteryCharging className="w-3.5 h-3.5 text-green-400" />;
  if (level != null && level <= 20) return <BatteryLow className="w-3.5 h-3.5 text-red-400" />;
  return <Battery className="w-3.5 h-3.5 text-gray-400" />;
}

// ── Main Component ──

export default function DeviceNetworkPanel({ deviceInfo }) {
  const [activePopover, setActivePopover] = useState(null);

  if (!deviceInfo) return null;

  const p = { activePopover, setActivePopover };

  const networkColor = {
    "4g": "text-green-400",
    "3g": "text-yellow-400",
    "2g": "text-red-400",
    "slow-2g": "text-red-400",
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Cpu className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-300">Device & Network</span>
      </div>

      {/* Camera */}
      <Section icon={Camera} title="Camera">
        <Row label="Device" value={deviceInfo.cameraLabel || "--"} infoKey="camera" {...p} />
        <Row label="Resolution" value={deviceInfo.cameraResolution || "--"} infoKey="cameraRes" {...p} />
        <Row label="Frame rate" value={deviceInfo.cameraFrameRate ? `${deviceInfo.cameraFrameRate} FPS` : "--"} infoKey="cameraFps" {...p} />
        {deviceInfo.cameraFacingMode && (
          <Row label="Facing" value={deviceInfo.cameraFacingMode} {...p} />
        )}
      </Section>

      {/* Microphone */}
      <Section icon={Mic} title="Microphone">
        <Row label="Device" value={deviceInfo.micLabel || "--"} infoKey="microphone" {...p} />
        {deviceInfo.micSampleRate && (
          <Row label="Sample rate" value={`${deviceInfo.micSampleRate} Hz`} {...p} />
        )}
        <div className="flex items-center justify-between gap-1 py-0.5">
          <div className="flex items-center gap-1.5">
            <InfoPopover infoKey="echoCancellation" {...p} />
            <Shield className="w-3 h-3 text-gray-500" />
            <span className="text-gray-500 text-[11px]">Echo cancel</span>
          </div>
          <BoolBadge value={deviceInfo.micEchoCancellation} />
        </div>
        <div className="flex items-center justify-between gap-1 py-0.5">
          <div className="flex items-center gap-1.5">
            <InfoPopover infoKey="noiseSuppression" {...p} />
            <Volume2 className="w-3 h-3 text-gray-500" />
            <span className="text-gray-500 text-[11px]">Noise suppress</span>
          </div>
          <BoolBadge value={deviceInfo.micNoiseSuppression} />
        </div>
        {deviceInfo.micAutoGainControl != null && (
          <div className="flex items-center justify-between gap-1 py-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 text-[11px] ml-5">Auto gain</span>
            </div>
            <BoolBadge value={deviceInfo.micAutoGainControl} />
          </div>
        )}
      </Section>

      {/* Network */}
      <Section icon={deviceInfo.isOnline ? Wifi : WifiOff} title="Network">
        <Row
          label="Status"
          value={deviceInfo.isOnline ? "Online" : "Offline"}
          color={deviceInfo.isOnline ? "text-green-400" : "text-red-400"}
          {...p}
        />
        {deviceInfo.networkType && (
          <Row
            label="Effective type"
            value={deviceInfo.networkType}
            color={networkColor[deviceInfo.networkType] || "text-gray-300"}
            infoKey="networkType"
            {...p}
          />
        )}
        {deviceInfo.connectionType && (
          <Row label="Connection" value={deviceInfo.connectionType} {...p} />
        )}
        {deviceInfo.networkDownlink != null && (
          <Row
            label="Est. downlink"
            value={`${deviceInfo.networkDownlink} Mbps`}
            color={deviceInfo.networkDownlink >= 2 ? "text-green-400" : deviceInfo.networkDownlink >= 0.5 ? "text-yellow-400" : "text-red-400"}
            infoKey="networkDownlink"
            {...p}
          />
        )}
        {deviceInfo.networkRtt != null && (
          <Row
            label="Network RTT"
            value={`${deviceInfo.networkRtt} ms`}
            color={deviceInfo.networkRtt <= 100 ? "text-green-400" : deviceInfo.networkRtt <= 300 ? "text-yellow-400" : "text-red-400"}
            infoKey="networkRtt"
            {...p}
          />
        )}
        {deviceInfo.networkSaveData && (
          <Row label="Data saver" value="Enabled" color="text-yellow-400" {...p} />
        )}
      </Section>

      {/* System */}
      <Section icon={Cpu} title="System">
        {deviceInfo.platform && (
          <Row label="Platform" value={deviceInfo.platform} {...p} />
        )}
        {deviceInfo.hardwareConcurrency && (
          <Row label="CPU cores" value={`${deviceInfo.hardwareConcurrency}`} infoKey="cpuCores" {...p} />
        )}
        {deviceInfo.deviceMemory && (
          <Row label="RAM" value={`${deviceInfo.deviceMemory} GB`} infoKey="memory" {...p} />
        )}
        {deviceInfo.batteryLevel != null && (
          <div className="flex items-center justify-between gap-1 py-0.5">
            <div className="flex items-center gap-1.5">
              <InfoPopover infoKey="batteryLevel" {...p} />
              <BatteryIcon level={deviceInfo.batteryLevel} charging={deviceInfo.batteryCharging} />
              <span className="text-gray-500 text-[11px]">Battery</span>
            </div>
            <span className={`text-[11px] font-mono ${
              deviceInfo.batteryLevel > 20 ? "text-green-400" : "text-red-400"
            }`}>
              {deviceInfo.batteryLevel}%{deviceInfo.batteryCharging ? " (charging)" : ""}
            </span>
          </div>
        )}
        {deviceInfo.jsHeapUsed != null && (
          <Row
            label="JS memory"
            value={`${deviceInfo.jsHeapUsed} / ${deviceInfo.jsHeapTotal} MB`}
            color={deviceInfo.jsHeapUsed > 150 ? "text-yellow-400" : "text-gray-300"}
            infoKey="jsHeap"
            {...p}
          />
        )}
      </Section>
    </div>
  );
}
