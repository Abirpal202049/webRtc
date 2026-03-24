import { useEffect, useRef, useState, useCallback } from "react";
import {
  Radio, Pause, Play, Rewind, FastForward, X,
  Filter, Eye, EyeOff, BarChart3,
} from "lucide-react";
import { ParticleEngine } from "../utils/particleEngine";

/**
 * PacketVisualizer — Interactive, educational packet flow visualization.
 *
 * Nerdy features:
 * - Click any packet to inspect: metadata, protocol stack, packet anatomy diagram
 * - Speed controls: pause, 0.25x, 1x, 2x
 * - Filter by type: show/hide video, audio, lost packets
 * - Live counters: total packets sent/received/lost this session
 * - Packet anatomy diagram showing UDP → SRTP → Encrypted payload structure
 * - Protocol stack visualization
 * - Estimated packet size breakdown
 */

function fmtExact(val, suffix = "") {
  if (val == null) return "--";
  if (val === 0) return `0${suffix}`;
  if (Math.abs(val) < 0.001) return `${val.toExponential(2)}${suffix}`;
  if (Math.abs(val) < 0.01) return `${val.toPrecision(3)}${suffix}`;
  if (Math.abs(val) < 1) return `${val.toFixed(6)}${suffix}`;
  if (Math.abs(val) < 100) return `${val.toFixed(2)}${suffix}`;
  return `${val.toFixed(1)}${suffix}`;
}

const SCALE = 80;
const MAX_VISUAL = 15;
function scalePackets(real) {
  if (!real || real <= 0) return 0;
  return Math.min(Math.ceil(real / SCALE), MAX_VISUAL);
}

const SPEED_OPTIONS = [
  { value: 0, label: "Pause", icon: Pause },
  { value: 0.25, label: "0.25x", icon: Rewind },
  { value: 1, label: "1x", icon: Play },
  { value: 2, label: "2x", icon: FastForward },
];

// ── Packet Anatomy Diagram ──

function PacketAnatomy({ particle }) {
  const m = particle.meta;
  const isVideo = m.mediaType === "Video";
  const estimatedPayload = isVideo ? "~1100-1200" : "~20-160";
  const estimatedTotal = isVideo ? "~1250" : "~200";

  return (
    <div className="mt-2 font-mono text-[9px] leading-relaxed">
      <p className="text-gray-400 text-[10px] font-sans font-medium mb-1">Packet Structure (estimated)</p>
      <div className="bg-black/40 rounded-lg p-2 space-y-0">
        {/* UDP Header */}
        <div className="border border-cyan-800/50 bg-cyan-950/30 rounded-t px-2 py-1">
          <div className="flex justify-between">
            <span className="text-cyan-400">UDP Header</span>
            <span className="text-cyan-600">8 bytes</span>
          </div>
          <div className="text-cyan-700 mt-0.5 grid grid-cols-2 gap-x-2">
            <span>Src Port: {m.localPort || "~54000"}</span>
            <span>Dst Port: {m.remotePort || "~12000"}</span>
            <span>Length: {estimatedTotal} bytes</span>
            <span>Checksum: 0x••••</span>
          </div>
        </div>

        {/* SRTP Header */}
        <div className="border border-purple-800/50 border-t-0 bg-purple-950/30 px-2 py-1">
          <div className="flex justify-between">
            <span className="text-purple-400">SRTP Header</span>
            <span className="text-purple-600">12 bytes</span>
          </div>
          <div className="text-purple-700 mt-0.5 grid grid-cols-2 gap-x-2">
            <span>Version: 2</span>
            <span>PT: {isVideo ? "96 (video)" : "111 (audio)"}</span>
            <span>Seq: #{particle.id % 65536}</span>
            <span>SSRC: 0x{(particle.id * 2654435761 >>> 0).toString(16).slice(0, 8).toUpperCase()}</span>
            <span>Timestamp: {Math.floor(performance.now())}</span>
            <span>Marker: {isVideo ? "1 (frame end)" : "0"}</span>
          </div>
        </div>

        {/* SRTP Auth Tag */}
        <div className="border border-yellow-800/50 border-t-0 bg-yellow-950/20 px-2 py-1">
          <div className="flex justify-between">
            <span className="text-yellow-500">SRTP Auth Tag</span>
            <span className="text-yellow-700">10 bytes</span>
          </div>
          <div className="text-yellow-800 mt-0.5">
            HMAC-SHA1: 0x{Array.from({length: 10}, () => Math.floor(Math.random()*256).toString(16).padStart(2,'0')).join('')}
          </div>
        </div>

        {/* Encrypted Payload */}
        <div className={`border ${particle.isLost ? "border-red-800/50 bg-red-950/20" : "border-green-800/50 bg-green-950/20"} border-t-0 rounded-b px-2 py-1`}>
          <div className="flex justify-between">
            <span className={particle.isLost ? "text-red-400" : "text-green-400"}>
              Encrypted Payload ({m.codec})
            </span>
            <span className={particle.isLost ? "text-red-700" : "text-green-700"}>{estimatedPayload} bytes</span>
          </div>
          <div className={`${particle.isLost ? "text-red-800" : "text-green-800"} mt-0.5`}>
            <span>🔒 AES-128-CM encrypted {m.codec} {isVideo ? "frame" : "sample"} data</span>
            {isVideo && m.resolution && <span className="block">Frame: {m.resolution} @ {m.fps || "?"}fps</span>}
            {!isVideo && <span className="block">Sample rate: 48000 Hz, Channels: 2 (stereo)</span>}
          </div>
        </div>
      </div>

      {/* Total */}
      <div className="flex justify-between mt-1 px-2 text-gray-500">
        <span>Total estimated size</span>
        <span className="text-gray-400">{estimatedTotal} bytes</span>
      </div>
    </div>
  );
}

// ── Protocol Stack Visualization ──

function ProtocolStack({ particle }) {
  const layers = [
    { name: "Application", detail: `WebRTC ${particle.meta.mediaType}`, color: "bg-blue-500/20 border-blue-500/30 text-blue-400" },
    { name: "Codec", detail: particle.meta.codec || "?", color: "bg-indigo-500/20 border-indigo-500/30 text-indigo-400" },
    { name: "SRTP", detail: "Encrypted media transport", color: "bg-purple-500/20 border-purple-500/30 text-purple-400" },
    { name: "DTLS", detail: "Key exchange & encryption", color: "bg-yellow-500/20 border-yellow-500/30 text-yellow-400" },
    { name: "ICE", detail: `Connectivity (${particle.meta.candidateType || "srflx"})`, color: "bg-orange-500/20 border-orange-500/30 text-orange-400" },
    { name: "UDP", detail: "Unreliable datagram", color: "bg-cyan-500/20 border-cyan-500/30 text-cyan-400" },
    { name: "IP", detail: "Internet Protocol", color: "bg-gray-500/20 border-gray-500/30 text-gray-400" },
  ];

  return (
    <div className="mt-2">
      <p className="text-gray-400 text-[10px] font-medium mb-1">Protocol Stack (this packet travels through)</p>
      <div className="space-y-0.5">
        {layers.map((l) => (
          <div key={l.name} className={`flex items-center justify-between px-2 py-0.5 rounded border text-[9px] font-mono ${l.color}`}>
            <span className="font-semibold">{l.name}</span>
            <span className="opacity-70">{l.detail}</span>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-gray-600 mt-1 text-center">↓ Physical network (WiFi / Ethernet / Cellular) ↓</p>
    </div>
  );
}

// ── Packet Inspector (enhanced) ──

function PacketInspector({ particle, onClose }) {
  const [activeTab, setActiveTab] = useState("details");

  if (!particle) return null;

  const m = particle.meta;
  const age = ((performance.now() - particle.born) / 1000).toFixed(1);
  const progress = particle.speed > 0 ? particle.x : 1 - particle.x;

  const statusColor = { Delivered: "text-green-400", Lost: "text-red-400" };

  const tabs = [
    { id: "details", label: "Details" },
    { id: "anatomy", label: "Anatomy" },
    { id: "stack", label: "Stack" },
  ];

  return (
    <div className="mt-2 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-750 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: particle.isLost ? "#EF4444" : m.mediaType === "Video" ? "#3B82F6" : "#22C55E" }}
          />
          <span className="text-xs font-semibold text-white">
            {m.mediaType} Packet #{particle.id}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
            particle.isLost ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
          }`}>{m.status}</span>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 text-[10px] font-medium py-1.5 transition-colors ${
              activeTab === tab.id
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-3">
        {activeTab === "details" && (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
              <div>
                <span className="text-gray-500 block">Direction</span>
                <span className="text-gray-300 font-medium">{m.direction}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Protocol</span>
                <span className="text-gray-300 font-medium">{m.protocol}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Codec</span>
                <span className="text-gray-300 font-medium">{m.codec || "--"}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Bitrate</span>
                <span className="text-gray-300 font-medium">{fmtExact(m.bitrate, " kbps")}</span>
              </div>
              {m.resolution && (
                <div>
                  <span className="text-gray-500 block">Resolution</span>
                  <span className="text-gray-300 font-medium">{m.resolution}</span>
                </div>
              )}
              {m.fps != null && (
                <div>
                  <span className="text-gray-500 block">Frame Rate</span>
                  <span className="text-gray-300 font-medium">{m.fps} FPS</span>
                </div>
              )}
              <div>
                <span className="text-gray-500 block">Round-Trip Time</span>
                <span className="text-gray-300 font-medium">{fmtExact(m.rtt, " ms")}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Jitter</span>
                <span className="text-gray-300 font-medium">{fmtExact(m.jitter, " ms")}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Packet Age</span>
                <span className="text-gray-300 font-medium">{age}s</span>
              </div>
              <div>
                <span className="text-gray-500 block">Transit Progress</span>
                <span className="text-gray-300 font-medium">{(Math.min(progress, 1) * 100).toFixed(0)}%</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-2">
              <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${particle.isLost ? "bg-red-500" : "bg-blue-500"}`}
                  style={{ width: `${Math.min(progress, 1) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[8px] text-gray-600 mt-0.5">
                <span>{m.direction === "Sending" ? "You" : "Peer"}</span>
                <span>{m.direction === "Sending" ? "Peer" : "You"}</span>
              </div>
            </div>

            {particle.isLost && (
              <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-300">
                <span className="font-medium">Packet lost in transit.</span> WebRTC uses UDP which prioritizes speed over reliability — lost packets are never retransmitted. The video decoder compensates by interpolating from nearby frames, which may cause a brief glitch.
              </div>
            )}
          </>
        )}

        {activeTab === "anatomy" && <PacketAnatomy particle={particle} />}
        {activeTab === "stack" && <ProtocolStack particle={particle} />}
      </div>
    </div>
  );
}

// ── Session Counters ──

function SessionCounters({ stats, sessionRef }) {
  if (!stats || !sessionRef.current) return null;
  const s = sessionRef.current;

  return (
    <div className="grid grid-cols-3 gap-2 mt-2">
      <div className="bg-gray-800/50 rounded-lg px-2 py-1.5 text-center">
        <div className="text-[10px] text-gray-500">Sent</div>
        <div className="text-xs font-mono text-blue-400 font-medium">{s.totalSent.toLocaleString()}</div>
        <div className="text-[8px] text-gray-600">{s.totalVideoSent.toLocaleString()}v + {s.totalAudioSent.toLocaleString()}a</div>
      </div>
      <div className="bg-gray-800/50 rounded-lg px-2 py-1.5 text-center">
        <div className="text-[10px] text-gray-500">Received</div>
        <div className="text-xs font-mono text-green-400 font-medium">{s.totalRecv.toLocaleString()}</div>
        <div className="text-[8px] text-gray-600">{s.totalVideoRecv.toLocaleString()}v + {s.totalAudioRecv.toLocaleString()}a</div>
      </div>
      <div className="bg-gray-800/50 rounded-lg px-2 py-1.5 text-center">
        <div className="text-[10px] text-gray-500">Lost</div>
        <div className={`text-xs font-mono font-medium ${s.totalLost > 0 ? "text-red-400" : "text-gray-400"}`}>{s.totalLost.toLocaleString()}</div>
        <div className="text-[8px] text-gray-600">{s.totalVideoLost.toLocaleString()}v + {s.totalAudioLost.toLocaleString()}a</div>
      </div>
    </div>
  );
}

// ── Filter Controls ──

function FilterControls({ filters, setFilters }) {
  const toggleFilter = (key) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const items = [
    { key: "video", label: "Video", color: "bg-blue-500", activeColor: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    { key: "audio", label: "Audio", color: "bg-green-500", activeColor: "bg-green-500/20 text-green-400 border-green-500/30" },
    { key: "lost", label: "Lost", color: "bg-red-500", activeColor: "bg-red-500/20 text-red-400 border-red-500/30" },
    { key: "send", label: "Send →", color: "bg-gray-400", activeColor: "bg-gray-500/20 text-gray-300 border-gray-500/30" },
    { key: "recv", label: "← Recv", color: "bg-gray-400", activeColor: "bg-gray-500/20 text-gray-300 border-gray-500/30" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1 mt-2">
      <Filter className="w-3 h-3 text-gray-600" />
      {items.map((item) => {
        const active = filters[item.key];
        return (
          <button
            key={item.key}
            onClick={() => toggleFilter(item.key)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-medium transition-colors ${
              active ? item.activeColor : "bg-gray-800/30 text-gray-600 border-gray-700/50"
            }`}
          >
            {active ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Main Component ──

export default function PacketVisualizer({ stats }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const [speed, setSpeed] = useState(1);
  const [selectedPacket, setSelectedPacket] = useState(null);
  const [showCounters, setShowCounters] = useState(true);
  const [filters, setFilters] = useState({
    video: true, audio: true, lost: true, send: true, recv: true,
  });

  // Session-wide cumulative counters
  const sessionRef = useRef({
    totalSent: 0, totalRecv: 0, totalLost: 0,
    totalVideoSent: 0, totalAudioSent: 0,
    totalVideoRecv: 0, totalAudioRecv: 0,
    totalVideoLost: 0, totalAudioLost: 0,
  });

  // Initialize engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new ParticleEngine(canvas);
    engineRef.current = engine;

    engine.onParticleSelect = (particle) => {
      setSelectedPacket(particle ? { ...particle, meta: { ...particle.meta } } : null);
    };

    engine.resize();
    engine.start();

    const observer = new ResizeObserver(() => engine.resize());
    observer.observe(canvas.parentElement);

    return () => {
      engine.stop();
      observer.disconnect();
      engineRef.current = null;
    };
  }, []);

  // Update spawn config + accumulate session counters
  useEffect(() => {
    if (!engineRef.current || !stats) return;

    const rtt = stats.rtt ?? 100;
    const transitMs = Math.max(500, Math.min(rtt * 10, 4000));

    // Accumulate session totals
    const s = sessionRef.current;
    s.totalVideoSent += stats.deltaVideoPacketsSent ?? 0;
    s.totalAudioSent += stats.deltaAudioPacketsSent ?? 0;
    s.totalVideoRecv += stats.deltaVideoPacketsReceived ?? 0;
    s.totalAudioRecv += stats.deltaAudioPacketsReceived ?? 0;
    s.totalVideoLost += stats.deltaVideoPacketsLost ?? 0;
    s.totalAudioLost += stats.deltaAudioPacketsLost ?? 0;
    s.totalSent = s.totalVideoSent + s.totalAudioSent;
    s.totalRecv = s.totalVideoRecv + s.totalAudioRecv;
    s.totalLost = s.totalVideoLost + s.totalAudioLost;

    // Apply filters to spawn rates
    const spawnRate = {
      videoSend: (filters.video && filters.send) ? scalePackets(stats.deltaVideoPacketsSent) : 0,
      audioSend: (filters.audio && filters.send) ? scalePackets(stats.deltaAudioPacketsSent) : 0,
      videoRecv: (filters.video && filters.recv) ? scalePackets(stats.deltaVideoPacketsReceived) : 0,
      audioRecv: (filters.audio && filters.recv) ? scalePackets(stats.deltaAudioPacketsReceived) : 0,
      videoLost: (filters.lost && filters.video) ? scalePackets(stats.deltaVideoPacketsLost) : 0,
      audioLost: (filters.lost && filters.audio) ? scalePackets(stats.deltaAudioPacketsLost) : 0,
    };

    engineRef.current.updateSpawnConfig({
      spawnRate,
      transitMs,
      stats,
    });
  }, [stats, filters]);

  const handleSpeedChange = useCallback((newSpeed) => {
    setSpeed(newSpeed);
    if (engineRef.current) engineRef.current.setSpeed(newSpeed);
  }, []);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-3">
      {/* Header + controls */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">Packet Flow</span>
          <button
            onClick={() => setShowCounters(!showCounters)}
            className={`p-0.5 rounded transition-colors ${showCounters ? "text-blue-400" : "text-gray-600"}`}
            title="Toggle session counters"
          >
            <BarChart3 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Speed controls */}
        <div className="flex items-center gap-1">
          {SPEED_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isActive = speed === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handleSpeedChange(opt.value)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                  isActive ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-500 hover:text-gray-300"
                }`}
                title={opt.label}
              >
                <Icon className="w-3 h-3" />
                <span className="hidden sm:inline">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter controls */}
      <FilterControls filters={filters} setFilters={setFilters} />

      {/* Canvas */}
      <div className="relative w-full mt-2" style={{ height: 140 }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full rounded-lg"
          style={{ background: "rgba(0,0,0,0.3)" }}
        />
      </div>

      <p className="text-[9px] text-gray-600 mt-1 text-center">
        Click any packet to inspect — use controls above to filter and adjust speed
      </p>

      {/* Session counters */}
      {showCounters && <SessionCounters stats={stats} sessionRef={sessionRef} />}

      {/* Packet inspector */}
      <PacketInspector
        particle={selectedPacket}
        onClose={() => setSelectedPacket(null)}
      />

      {/* Summary stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2 text-[10px] font-mono">
          <span className="text-gray-500">
            Send: <span className="text-gray-300">{fmtExact(stats.videoSendBitrate, " kbps")}</span>
          </span>
          <span className="text-gray-500">
            RTT: <span className="text-gray-300">{fmtExact(stats.rtt, " ms")}</span>
          </span>
          <span className="text-gray-500">
            Recv: <span className="text-gray-300">{fmtExact(stats.videoRecvBitrate, " kbps")}</span>
          </span>
          <span className="text-gray-500">
            Loss: <span className={`${stats.videoPacketLossPercent > 0 ? "text-red-400" : "text-gray-300"}`}>{fmtExact(stats.videoPacketLossPercent, "%")}</span>
          </span>
          <span className="text-gray-500">
            Pkts/interval: <span className="text-gray-300">{(stats.deltaVideoPacketsSent ?? 0) + (stats.deltaAudioPacketsSent ?? 0)} sent</span>
          </span>
          <span className="text-gray-500">
            Pkts/interval: <span className="text-gray-300">{(stats.deltaVideoPacketsReceived ?? 0) + (stats.deltaAudioPacketsReceived ?? 0)} recv</span>
          </span>
        </div>
      )}

      {!stats && (
        <p className="text-[10px] text-gray-600 mt-2">Waiting for connection...</p>
      )}
    </div>
  );
}
