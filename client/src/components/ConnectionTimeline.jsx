import { useMemo, useState } from "react";
import { Clock, ChevronDown, ChevronRight } from "lucide-react";

/**
 * ConnectionTimeline — Gantt chart of the real connection setup phases.
 *
 * Parses the eventLog to extract exact timestamps for each phase:
 * WebSocket → Signaling → Device Load → Transport → DTLS → Produce → Consume
 *
 * All timestamps are real Date objects from the event log.
 * Shows WHERE latency comes from during connection establishment.
 */

const PHASE_CONFIG = {
  websocket: { label: "WebSocket", color: "#6B7280", desc: "TCP connection to signaling server" },
  signaling: { label: "Signaling", color: "#3B82F6", desc: "Room creation / admission control" },
  device: { label: "Device Load", color: "#8B5CF6", desc: "mediasoup Device initialization with router capabilities" },
  transport: { label: "Transports", color: "#06B6D4", desc: "WebRTC transport creation (send + recv)" },
  dtls: { label: "DTLS Handshake", color: "#EAB308", desc: "Encryption key exchange for media" },
  produce: { label: "Produce", color: "#22C55E", desc: "Start sending audio/video to SFU" },
  consume: { label: "First Consume", color: "#F97316", desc: "Start receiving media from a peer" },
};

function extractPhases(eventLog) {
  if (!eventLog || eventLog.length === 0) return [];

  const phases = [];
  let wsStart = null;
  let wsEnd = null;
  let signalingStart = null;
  let signalingEnd = null;
  let deviceStart = null;
  let deviceEnd = null;
  let transportStart = null;
  let transportEnd = null;
  let dtlsStart = null;
  let dtlsEnd = null;
  let produceStart = null;
  let produceEnd = null;
  let consumeStart = null;
  let consumeEnd = null;

  for (const entry of eventLog) {
    const d = entry.detail?.toLowerCase() || "";
    const t = entry.timestamp;

    // WebSocket connect
    if (d.includes("connected to signaling server")) {
      if (!wsStart) wsStart = eventLog[0]?.timestamp || t;
      wsEnd = t;
    }

    // Signaling phase
    if (d.includes("creating room") || d.includes("requesting to join")) {
      if (!signalingStart) signalingStart = t;
    }
    if (d.includes("admitted") || d.includes("room") && d.includes("created") && !d.includes("creating")) {
      signalingEnd = t;
    }

    // Device load
    if (d.includes("received router rtp capabilities") || d.includes("router rtp capabilities")) {
      if (!deviceStart) deviceStart = t;
    }
    if (d.includes("device loaded")) {
      deviceEnd = t;
    }

    // Transport creation
    if (d.includes("transport created")) {
      if (!transportStart) transportStart = t;
      transportEnd = t; // last transport-created
    }

    // DTLS / transport connected
    if (d.includes("send transport: connecting") || d.includes("transport: connecting")) {
      if (!dtlsStart) dtlsStart = t;
    }
    if (d.includes("send transport: connected") || d.includes("transport: connected")) {
      dtlsEnd = t;
    }

    // Produce
    if (d.includes("audio producer created") || d.includes("video producer created")) {
      if (!produceStart) produceStart = t;
      produceEnd = t;
    }

    // Consume
    if (d.includes("consuming")) {
      if (!consumeStart) consumeStart = t;
      consumeEnd = t;
    }
  }

  const t0 = eventLog[0]?.timestamp;
  if (!t0) return [];

  const add = (key, start, end) => {
    if (start && end) {
      phases.push({
        key,
        ...PHASE_CONFIG[key],
        startMs: start.getTime() - t0.getTime(),
        endMs: end.getTime() - t0.getTime(),
        durationMs: end.getTime() - start.getTime(),
      });
    }
  };

  add("websocket", wsStart || t0, wsEnd);
  add("signaling", signalingStart, signalingEnd);
  add("device", deviceStart, deviceEnd);
  add("transport", transportStart, transportEnd);
  add("dtls", dtlsStart, dtlsEnd);
  add("produce", produceStart, produceEnd);
  add("consume", consumeStart, consumeEnd);

  return phases;
}

export default function ConnectionTimeline({ eventLog }) {
  const [expanded, setExpanded] = useState(true);
  const phases = useMemo(() => extractPhases(eventLog), [eventLog]);

  if (phases.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">Connection Timeline</span>
        </div>
        <p className="text-xs text-gray-600 mt-1">Timeline will populate as the connection is established...</p>
      </div>
    );
  }

  const totalMs = Math.max(...phases.map((p) => p.endMs), 1);
  const lastPhase = phases[phases.length - 1];
  const timeToMedia = lastPhase ? lastPhase.endMs : 0;

  // SVG dimensions
  const W = 340;
  const barH = 16;
  const gap = 3;
  const PAD_L = 75;
  const PAD_R = 10;
  const PAD_T = 4;
  const chartW = W - PAD_L - PAD_R;
  const H = PAD_T + phases.length * (barH + gap) + 20;

  const toX = (ms) => PAD_L + (ms / totalMs) * chartW;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">Connection Timeline</span>
          <span className="text-[9px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded font-medium font-mono">
            {timeToMedia}ms total
          </span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-500 hover:text-gray-300 p-0.5"
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>

      {expanded && (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H }}>
            {/* Time grid */}
            {[0.25, 0.5, 0.75, 1].map((frac) => (
              <g key={`tgrid-${frac}`}>
                <line
                  x1={toX(totalMs * frac)}
                  y1={0}
                  x2={toX(totalMs * frac)}
                  y2={H - 16}
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth={0.5}
                />
                <text
                  x={toX(totalMs * frac)}
                  y={H - 4}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.2)"
                  fontSize="7"
                  fontFamily="monospace"
                >
                  {Math.round(totalMs * frac)}ms
                </text>
              </g>
            ))}

            {/* Phase bars */}
            {phases.map((phase, i) => {
              const y = PAD_T + i * (barH + gap);
              const x1 = toX(phase.startMs);
              const x2 = toX(phase.endMs);
              const barWidth = Math.max(x2 - x1, 2);

              return (
                <g key={phase.key}>
                  {/* Label */}
                  <text
                    x={PAD_L - 4}
                    y={y + barH / 2 + 1}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fill="rgba(255,255,255,0.5)"
                    fontSize="8"
                    fontFamily="sans-serif"
                  >
                    {phase.label}
                  </text>

                  {/* Bar */}
                  <rect
                    x={x1}
                    y={y}
                    width={barWidth}
                    height={barH}
                    rx={3}
                    fill={phase.color}
                    opacity={0.7}
                  />

                  {/* Duration label inside bar */}
                  {barWidth > 30 && (
                    <text
                      x={x1 + barWidth / 2}
                      y={y + barH / 2 + 1}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="white"
                      fontSize="7"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {phase.durationMs}ms
                    </text>
                  )}

                  {/* Duration label outside bar if too small */}
                  {barWidth <= 30 && (
                    <text
                      x={x1 + barWidth + 3}
                      y={y + barH / 2 + 1}
                      dominantBaseline="middle"
                      fill="rgba(255,255,255,0.4)"
                      fontSize="7"
                      fontFamily="monospace"
                    >
                      {phase.durationMs}ms
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Phase descriptions */}
          <div className="mt-2 space-y-0.5">
            {phases.map((phase) => (
              <div key={phase.key} className="flex items-center gap-2 text-[9px]">
                <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: phase.color }} />
                <span className="text-gray-500">{phase.label}:</span>
                <span className="text-gray-400">{phase.desc}</span>
                <span className="text-gray-600 font-mono ml-auto">{phase.durationMs}ms</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
