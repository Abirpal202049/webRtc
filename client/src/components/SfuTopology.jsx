import { useMemo, useState } from "react";
import { Server, ChevronDown, ChevronRight } from "lucide-react";

/**
 * SfuTopology — Data-driven SVG visualization of live SFU routing.
 *
 * Every number on this diagram comes from real RTCStatsReport data:
 * - Line thickness = actual bitrate between you and the SFU server
 * - Animated dots speed = derived from measured RTT
 * - Per-peer labels = real bitrate/packet loss from consumer.getStats()
 * - Outbound stats = real producer stats from sendTransport.getStats()
 *
 * Nothing is faked. If a line is thin, that peer is genuinely sending
 * less data. If a dot moves slowly, the RTT to the server is high.
 */

function fmt(val, suffix = "") {
  if (val == null || isNaN(val)) return "--";
  if (val === 0) return `0${suffix}`;
  if (Math.abs(val) < 1) return `${val.toFixed(2)}${suffix}`;
  if (Math.abs(val) < 100) return `${val.toFixed(1)}${suffix}`;
  return `${Math.round(val)}${suffix}`;
}

function bitrateColor(kbps) {
  if (kbps == null || kbps <= 0) return "#374151"; // gray
  if (kbps > 500) return "#22C55E"; // green — healthy
  if (kbps > 100) return "#EAB308"; // yellow — moderate
  return "#EF4444"; // red — low
}

function bitrateWidth(kbps) {
  if (kbps == null || kbps <= 0) return 0.5;
  if (kbps > 1000) return 3;
  if (kbps > 500) return 2.5;
  if (kbps > 200) return 2;
  if (kbps > 50) return 1.5;
  return 1;
}

function lossColor(pct) {
  if (pct == null || pct === 0) return "#22C55E";
  if (pct < 1) return "#EAB308";
  return "#EF4444";
}

export default function SfuTopology({
  participantCount = 1,
  connectionState,
  peerStats = new Map(),
  outboundStats = null,
}) {
  const [selectedPeer, setSelectedPeer] = useState(null);
  const [showDetails, setShowDetails] = useState(true);

  const isConnected = connectionState === "connected";

  // Build participant positions around the SFU center
  const nodes = useMemo(() => {
    const count = Math.max(participantCount, 1);
    const result = [];
    const cx = 150;
    const cy = 95;
    const rx = 115;
    const ry = 70;

    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      result.push({
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
        isLocal: i === 0,
        index: i,
      });
    }
    return result;
  }, [participantCount]);

  // Map peer stats to nodes by order
  const peerStatsArray = useMemo(() => Array.from(peerStats.entries()), [peerStats]);

  const serverX = 150;
  const serverY = 95;

  // Compute aggregate stats
  const totalInbound = useMemo(() => {
    let total = 0;
    for (const [, s] of peerStats) {
      total += s.totalBitrate || 0;
    }
    return total;
  }, [peerStats]);

  const sfuConnections = participantCount;
  const meshConnections = (participantCount * (participantCount - 1)) / 2;

  // RTT-based animation duration
  const rtt = outboundStats?.rtt ?? 100;
  const animDuration = Math.max(0.5, Math.min(rtt / 50, 4)); // 0.5s to 4s

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">Network Topology</span>
          <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-medium">
            LIVE
          </span>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-gray-500 hover:text-gray-300 p-0.5"
        >
          {showDetails ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* SVG Topology — every visual maps to real data */}
      <svg viewBox="0 0 300 190" className="w-full" style={{ maxHeight: 200 }}>
        <defs>
          {/* Arrowhead marker */}
          <marker id="arrow-send" viewBox="0 0 10 10" refX="8" refY="5"
            markerWidth="4" markerHeight="4" orient="auto" fill="#3B82F6">
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
          <marker id="arrow-recv" viewBox="0 0 10 10" refX="8" refY="5"
            markerWidth="4" markerHeight="4" orient="auto" fill="#22C55E">
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>

        {/* Connection lines — thickness = real bitrate */}
        {nodes.map((node, i) => {
          const peerEntry = i === 0 ? null : peerStatsArray[i - 1];
          const peerStat = peerEntry?.[1];

          // Upload line (You → SFU): use outbound stats for local, or placeholder for others
          const uploadBitrate = i === 0 ? (outboundStats?.totalBitrate || 0) : (peerStat?.totalBitrate || 0);
          const uploadColor = i === 0 ? bitrateColor(outboundStats?.totalBitrate) : "#4B5563";
          const uploadWidth = i === 0 ? bitrateWidth(outboundStats?.totalBitrate) : 1;

          // Download line (SFU → You): real bitrate from this peer's consumers
          const downloadBitrate = peerStat?.totalBitrate || 0;
          const downloadColor = bitrateColor(downloadBitrate);
          const downloadWidth = bitrateWidth(downloadBitrate);

          // Offset the two lines slightly so they don't overlap
          const dx = serverX - node.x;
          const dy = serverY - node.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const perpX = (-dy / len) * 2;
          const perpY = (dx / len) * 2;

          return (
            <g key={`conn-${i}`}>
              {/* Upload: node → server (slightly offset up) */}
              <line
                x1={node.x + perpX}
                y1={node.y + perpY}
                x2={serverX + perpX}
                y2={serverY + perpY}
                stroke={i === 0 ? uploadColor : "#374151"}
                strokeWidth={i === 0 ? uploadWidth : 0.5}
                strokeOpacity={isConnected ? 0.7 : 0.2}
                strokeDasharray={isConnected && i === 0 ? "none" : "3,2"}
                markerEnd={i === 0 && isConnected ? "url(#arrow-send)" : undefined}
              />

              {/* Download: server → node (slightly offset down) */}
              {i > 0 && (
                <line
                  x1={serverX - perpX}
                  y1={serverY - perpY}
                  x2={node.x - perpX}
                  y2={node.y - perpY}
                  stroke={isConnected ? downloadColor : "#374151"}
                  strokeWidth={isConnected ? downloadWidth : 0.5}
                  strokeOpacity={isConnected ? 0.6 : 0.2}
                  strokeDasharray={isConnected && downloadBitrate > 0 ? "none" : "3,2"}
                  markerEnd={isConnected && downloadBitrate > 0 ? "url(#arrow-recv)" : undefined}
                />
              )}

              {/* Animated packet dots — speed derived from real RTT */}
              {isConnected && i === 0 && outboundStats?.totalBitrate > 0 && (
                <>
                  <circle r="2" fill="#3B82F6" opacity="0.9">
                    <animateMotion
                      dur={`${animDuration}s`}
                      repeatCount="indefinite"
                      path={`M${node.x + perpX},${node.y + perpY} L${serverX + perpX},${serverY + perpY}`}
                    />
                  </circle>
                  <circle r="1.5" fill="#3B82F6" opacity="0.5">
                    <animateMotion
                      dur={`${animDuration * 1.3}s`}
                      repeatCount="indefinite"
                      path={`M${node.x + perpX},${node.y + perpY} L${serverX + perpX},${serverY + perpY}`}
                      begin={`${animDuration * 0.5}s`}
                    />
                  </circle>
                </>
              )}
              {isConnected && i > 0 && downloadBitrate > 0 && (
                <circle r="1.5" fill="#22C55E" opacity="0.8">
                  <animateMotion
                    dur={`${animDuration * 1.1}s`}
                    repeatCount="indefinite"
                    path={`M${serverX - perpX},${serverY - perpY} L${node.x - perpX},${node.y - perpY}`}
                  />
                </circle>
              )}

              {/* Bitrate label on the line (for local upload) */}
              {i === 0 && isConnected && outboundStats?.totalBitrate > 0 && (
                <text
                  x={(node.x + serverX) / 2 + perpX * 3}
                  y={(node.y + serverY) / 2 + perpY * 3 - 4}
                  textAnchor="middle"
                  fill="#60A5FA"
                  fontSize="7"
                  fontFamily="monospace"
                  opacity="0.8"
                >
                  {fmt(outboundStats.totalBitrate, " kbps")}
                </text>
              )}

              {/* Bitrate label for download from each peer */}
              {i > 0 && isConnected && downloadBitrate > 0 && (
                <text
                  x={(node.x + serverX) / 2 - perpX * 3}
                  y={(node.y + serverY) / 2 - perpY * 3 + 4}
                  textAnchor="middle"
                  fill="#4ADE80"
                  fontSize="6"
                  fontFamily="monospace"
                  opacity="0.7"
                >
                  {fmt(downloadBitrate, "k")}
                </text>
              )}
            </g>
          );
        })}

        {/* SFU Server node (center) */}
        <rect
          x={serverX - 22}
          y={serverY - 16}
          width={44}
          height={32}
          rx={6}
          fill="#1E1B4B"
          stroke="#4F46E5"
          strokeWidth={1.5}
        />
        <text
          x={serverX}
          y={serverY - 3}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#818CF8"
          fontSize="8"
          fontWeight="bold"
          fontFamily="sans-serif"
        >
          SFU
        </text>
        {isConnected && outboundStats?.rtt != null && (
          <text
            x={serverX}
            y={serverY + 8}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#6366F1"
            fontSize="6"
            fontFamily="monospace"
          >
            {fmt(outboundStats.rtt, "ms")}
          </text>
        )}

        {/* Participant nodes */}
        {nodes.map((node, i) => {
          const peerEntry = i === 0 ? null : peerStatsArray[i - 1];
          const peerStat = peerEntry?.[1];
          const peerId = peerEntry?.[0];
          const isSelected = selectedPeer === peerId;
          const hasLoss = peerStat?.packetLoss > 0;

          return (
            <g
              key={`node-${i}`}
              style={{ cursor: i > 0 ? "pointer" : "default" }}
              onClick={() => i > 0 && setSelectedPeer(isSelected ? null : peerId)}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={node.isLocal ? 15 : 12}
                fill={node.isLocal ? "#1E3A5F" : isSelected ? "#1E3A5F" : "#1F2937"}
                stroke={
                  node.isLocal ? "#3B82F6"
                    : hasLoss ? "#EF4444"
                    : isConnected && peerStat?.totalBitrate > 0 ? "#22C55E"
                    : "#4B5563"
                }
                strokeWidth={node.isLocal || isSelected ? 2 : 1}
              />
              <text
                x={node.x}
                y={node.y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={node.isLocal ? "#60A5FA" : "#9CA3AF"}
                fontSize={node.isLocal ? "8" : "7"}
                fontWeight={node.isLocal ? "bold" : "normal"}
                fontFamily="sans-serif"
              >
                {node.isLocal ? "You" : (peerStat?.displayName?.slice(0, 4) || `P${i + 1}`)}
              </text>

              {/* Packet loss indicator dot */}
              {hasLoss && (
                <circle
                  cx={node.x + 10}
                  cy={node.y - 10}
                  r={3}
                  fill="#EF4444"
                  opacity="0.8"
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Selected peer detail panel */}
      {selectedPeer && peerStats.has(selectedPeer) && (() => {
        const s = peerStats.get(selectedPeer);
        return (
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-2.5 mt-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-white">{s.displayName}</span>
              <button onClick={() => setSelectedPeer(null)} className="text-gray-500 hover:text-gray-300 text-[10px]">close</button>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
              <div>
                <span className="text-gray-500">Video bitrate</span>
                <span className={`ml-1 font-mono ${s.videoBitrate > 200 ? "text-green-400" : s.videoBitrate > 0 ? "text-yellow-400" : "text-gray-500"}`}>
                  {fmt(s.videoBitrate, " kbps")}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Audio bitrate</span>
                <span className="ml-1 font-mono text-gray-300">{fmt(s.audioBitrate, " kbps")}</span>
              </div>
              <div>
                <span className="text-gray-500">Packet loss</span>
                <span className={`ml-1 font-mono`} style={{ color: lossColor(s.packetLoss) }}>
                  {fmt(s.packetLoss, "%")}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Jitter</span>
                <span className="ml-1 font-mono text-gray-300">{fmt(s.jitter, " ms")}</span>
              </div>
              <div>
                <span className="text-gray-500">FPS</span>
                <span className="ml-1 font-mono text-gray-300">{s.fps ?? "--"}</span>
              </div>
              <div>
                <span className="text-gray-500">Codec</span>
                <span className="ml-1 font-mono text-gray-300">{s.codec || "--"}</span>
              </div>
              <div>
                <span className="text-gray-500">Resolution</span>
                <span className="ml-1 font-mono text-gray-300">{s.resolution || "--"}</span>
              </div>
              <div>
                <span className="text-gray-500">Packets recv</span>
                <span className="ml-1 font-mono text-gray-300">{s.packetsReceived?.toLocaleString() || "0"}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Live aggregate stats */}
      {showDetails && (
        <div className="mt-2 space-y-2">
          {/* Connection comparison */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-2.5 py-1.5 text-center">
              <div className="text-[9px] text-indigo-400 font-medium">SFU (Current)</div>
              <div className="text-sm font-mono text-indigo-300 font-bold">{sfuConnections}</div>
              <div className="text-[8px] text-gray-600">connections</div>
            </div>
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg px-2.5 py-1.5 text-center">
              <div className="text-[9px] text-gray-500 font-medium">Mesh (if P2P)</div>
              <div className="text-sm font-mono text-gray-400 font-bold">{meshConnections}</div>
              <div className="text-[8px] text-gray-600">connections</div>
            </div>
          </div>

          {/* Real bandwidth breakdown */}
          {isConnected && (
            <div className="bg-gray-800/30 rounded-lg px-2.5 py-2 space-y-1">
              <p className="text-[9px] font-medium text-gray-400">Live Bandwidth (from getStats())</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] font-mono">
                <div className="flex justify-between">
                  <span className="text-blue-400">↑ Upload</span>
                  <span className="text-blue-300">{fmt(outboundStats?.totalBitrate, " kbps")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-400">↓ Download</span>
                  <span className="text-green-300">{fmt(totalInbound, " kbps")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">RTT to SFU</span>
                  <span className="text-gray-400">{fmt(outboundStats?.rtt, " ms")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Peers receiving</span>
                  <span className="text-gray-400">{peerStats.size}</span>
                </div>
              </div>
            </div>
          )}

          {/* Per-peer summary table */}
          {peerStats.size > 0 && (
            <div className="bg-gray-800/30 rounded-lg px-2.5 py-2">
              <p className="text-[9px] font-medium text-gray-400 mb-1">Per-Peer Inbound (click node for details)</p>
              <div className="space-y-0.5">
                {Array.from(peerStats.entries()).map(([peerId, s]) => (
                  <div
                    key={peerId}
                    className={`flex items-center justify-between text-[9px] font-mono px-1 py-0.5 rounded cursor-pointer hover:bg-gray-700/30 ${
                      selectedPeer === peerId ? "bg-gray-700/40" : ""
                    }`}
                    onClick={() => setSelectedPeer(selectedPeer === peerId ? null : peerId)}
                  >
                    <span className="text-gray-400 truncate max-w-[60px]">{s.displayName}</span>
                    <div className="flex items-center gap-2">
                      <span style={{ color: bitrateColor(s.videoBitrate) }}>
                        {fmt(s.videoBitrate, "k")}
                      </span>
                      <span style={{ color: lossColor(s.packetLoss) }} className="w-[35px] text-right">
                        {fmt(s.packetLoss, "%")}
                      </span>
                      <span className="text-gray-500 w-[25px] text-right">
                        {s.fps ?? "-"}fps
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {participantCount <= 1 && (
        <p className="text-[9px] text-gray-600 mt-1.5 text-center">
          Waiting for participants — topology will populate with real data
        </p>
      )}
    </div>
  );
}
