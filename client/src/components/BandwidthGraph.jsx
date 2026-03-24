import { useState, useMemo } from "react";
import { TrendingUp, Info, X } from "lucide-react";

/**
 * BandwidthGraph — Real-time visualization of the GCC congestion control algorithm.
 *
 * Every pixel on this graph is real data from RTCStatsReport:
 * - Blue line: availableOutgoingBitrate (the browser's bandwidth estimate)
 * - Green line: actual video send bitrate
 * - Red dashed line: actual video receive bitrate
 * - Background bands: qualityLimitationReason (none/bandwidth/cpu)
 *
 * This is the GCC (Google Congestion Control) algorithm made visible.
 * Throttle your network in DevTools and watch it probe, detect congestion,
 * back off, and recover in real-time.
 */

const QUALITY_COLORS = {
  none: "rgba(34, 197, 94, 0.08)",
  bandwidth: "rgba(234, 179, 8, 0.12)",
  cpu: "rgba(239, 68, 68, 0.12)",
  other: "rgba(168, 85, 247, 0.08)",
};

const QUALITY_LABELS = {
  none: "No limitation",
  bandwidth: "Bandwidth limited",
  cpu: "CPU limited",
  other: "Other limitation",
};

function fmt(val) {
  if (val == null || isNaN(val)) return "--";
  if (val === 0) return "0";
  if (val > 1000) return `${(val / 1000).toFixed(1)}M`;
  return `${Math.round(val)}`;
}

export default function BandwidthGraph({ history, stats }) {
  const [showInfo, setShowInfo] = useState(false);
  const [hoverIndex, setHoverIndex] = useState(null);

  const data = useMemo(() => {
    const bwe = history?.availableBitrate || [];
    const send = history?.videoSendBitrate || [];
    const recv = history?.videoRecvBitrate || [];
    const ql = history?.qualityLimitation || [];
    const len = Math.max(bwe.length, send.length, recv.length);
    if (len === 0) return null;

    const points = [];
    for (let i = 0; i < len; i++) {
      points.push({
        bwe: bwe[i] ?? 0,
        send: send[i] ?? 0,
        recv: recv[i] ?? 0,
        ql: ql[i] || "none",
      });
    }
    return points;
  }, [history]);

  // Must be above early return to satisfy Rules of Hooks
  const congestionEvents = useMemo(() => {
    if (!data) return [];
    const events = [];
    for (let i = 2; i < data.length; i++) {
      const drop = data[i - 1].bwe - data[i].bwe;
      if (drop > data[i - 1].bwe * 0.2 && data[i - 1].bwe > 100) {
        events.push(i);
      }
    }
    return events;
  }, [data]);

  if (!data || !stats) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-3">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">Bandwidth Estimation</span>
        </div>
        <p className="text-xs text-gray-600">Waiting for connection...</p>
      </div>
    );
  }

  // Chart dimensions
  const W = 340;
  const H = 120;
  const PAD_L = 40;
  const PAD_R = 8;
  const PAD_T = 8;
  const PAD_B = 16;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  // Y-axis scale
  const allVals = data.flatMap((d) => [d.bwe, d.send, d.recv]);
  const maxVal = Math.max(...allVals, 100) * 1.15;

  const toX = (i) => PAD_L + (i / (data.length - 1 || 1)) * chartW;
  const toY = (v) => PAD_T + chartH - (v / maxVal) * chartH;

  const makePath = (key) =>
    data
      .map((d, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d[key]).toFixed(1)}`)
      .join(" ");

  // Current quality limitation
  const currentQL = stats.qualityLimitationReason || "none";

  const hoverData = hoverIndex != null ? data[hoverIndex] : null;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">Bandwidth Estimation</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
            currentQL === "none" ? "bg-green-500/20 text-green-400"
              : currentQL === "bandwidth" ? "bg-yellow-500/20 text-yellow-400"
              : "bg-red-500/20 text-red-400"
          }`}>
            {QUALITY_LABELS[currentQL] || currentQL}
          </span>
        </div>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="text-gray-600 hover:text-gray-400 p-0.5"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </div>

      {showInfo && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 mb-2 text-[11px] text-gray-300 leading-relaxed">
          <div className="flex justify-between items-start mb-1">
            <span className="font-semibold text-white">Google Congestion Control (GCC)</span>
            <button onClick={() => setShowInfo(false)} className="text-gray-500 hover:text-gray-300">
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="mb-1">
            The browser continuously estimates available bandwidth using the GCC algorithm.
            It sends probe packets, measures one-way delay variations, and adjusts the estimate.
          </p>
          <p className="mb-1">
            <span className="text-blue-400">Blue line</span> = the BWE (Bandwidth Estimation) — what the browser THINKS is available.
            <span className="text-green-400"> Green line</span> = what you're ACTUALLY sending.
            When the green exceeds the blue, congestion control kicks in.
          </p>
          <p>
            <span className="text-yellow-400">Yellow background</span> = bandwidth-limited (slow network).
            <span className="text-red-400"> Red background</span> = CPU-limited (can't encode fast enough).
            Try throttling in DevTools to see it react!
          </p>
        </div>
      )}

      {/* SVG Chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxHeight: H }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const mx = ((e.clientX - rect.left) / rect.width) * W;
          const idx = Math.round(((mx - PAD_L) / chartW) * (data.length - 1));
          setHoverIndex(Math.max(0, Math.min(idx, data.length - 1)));
        }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {/* Quality limitation background bands */}
        {data.map((d, i) => {
          if (i >= data.length - 1) return null;
          const x1 = toX(i);
          const x2 = toX(i + 1);
          return (
            <rect
              key={`ql-${i}`}
              x={x1}
              y={PAD_T}
              width={x2 - x1}
              height={chartH}
              fill={QUALITY_COLORS[d.ql] || QUALITY_COLORS.none}
            />
          );
        })}

        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map((frac) => (
          <g key={`grid-${frac}`}>
            <line
              x1={PAD_L}
              y1={PAD_T + chartH * (1 - frac)}
              x2={W - PAD_R}
              y2={PAD_T + chartH * (1 - frac)}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={0.5}
            />
            <text
              x={PAD_L - 4}
              y={PAD_T + chartH * (1 - frac) + 3}
              textAnchor="end"
              fill="rgba(255,255,255,0.2)"
              fontSize="7"
              fontFamily="monospace"
            >
              {fmt(maxVal * frac)}
            </text>
          </g>
        ))}

        {/* Receive bitrate (red dashed, drawn first = behind) */}
        <path d={makePath("recv")} fill="none" stroke="#EF4444" strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />

        {/* Send bitrate (green) */}
        <path d={makePath("send")} fill="none" stroke="#22C55E" strokeWidth={1.5} opacity={0.8} />

        {/* BWE estimate (blue, on top) */}
        <path d={makePath("bwe")} fill="none" stroke="#3B82F6" strokeWidth={2} opacity={0.9} />

        {/* Congestion event markers */}
        {congestionEvents.map((i) => (
          <g key={`cong-${i}`}>
            <line
              x1={toX(i)}
              y1={PAD_T}
              x2={toX(i)}
              y2={PAD_T + chartH}
              stroke="#EF4444"
              strokeWidth={0.5}
              strokeDasharray="2,2"
              opacity={0.5}
            />
            <text
              x={toX(i)}
              y={PAD_T + 8}
              textAnchor="middle"
              fill="#EF4444"
              fontSize="6"
              opacity={0.7}
            >
              GCC
            </text>
          </g>
        ))}

        {/* Hover line and tooltip */}
        {hoverIndex != null && (
          <>
            <line
              x1={toX(hoverIndex)}
              y1={PAD_T}
              x2={toX(hoverIndex)}
              y2={PAD_T + chartH}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth={0.5}
            />
            <circle cx={toX(hoverIndex)} cy={toY(hoverData.bwe)} r={3} fill="#3B82F6" />
            <circle cx={toX(hoverIndex)} cy={toY(hoverData.send)} r={2.5} fill="#22C55E" />
            <circle cx={toX(hoverIndex)} cy={toY(hoverData.recv)} r={2} fill="#EF4444" />
          </>
        )}

        {/* X-axis label */}
        <text x={W / 2} y={H - 2} textAnchor="middle" fill="rgba(255,255,255,0.15)" fontSize="7" fontFamily="monospace">
          ~{((data.length * 1.5) / 1).toFixed(0)}s window (kbps)
        </text>
      </svg>

      {/* Hover tooltip */}
      {hoverData && (
        <div className="flex items-center gap-3 text-[9px] font-mono mt-1 px-1">
          <span className="text-blue-400">BWE: {fmt(hoverData.bwe)}k</span>
          <span className="text-green-400">Send: {fmt(hoverData.send)}k</span>
          <span className="text-red-400">Recv: {fmt(hoverData.recv)}k</span>
          <span className={`${
            hoverData.ql === "none" ? "text-green-500" : hoverData.ql === "bandwidth" ? "text-yellow-500" : "text-red-500"
          }`}>{hoverData.ql}</span>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 mt-1.5 text-[9px]">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-blue-500 rounded" />
          <span className="text-gray-500">BWE estimate</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-green-500 rounded" />
          <span className="text-gray-500">Actual send</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-red-500 rounded border-dashed" style={{ borderTop: "1px dashed #EF4444", height: 0 }} />
          <span className="text-gray-500">Actual recv</span>
        </div>
      </div>
    </div>
  );
}
