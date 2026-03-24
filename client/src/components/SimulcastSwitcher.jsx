import { useState, useEffect, useCallback, useRef } from "react";
import { Layers, Info, X, ChevronDown, ChevronRight } from "lucide-react";

/**
 * SimulcastSwitcher — Interactive simulcast layer control and visualization.
 *
 * Shows which of the 3 simulcast layers are active and lets you force-switch.
 * Real data from outbound-rtp stats (per-layer) and consumer stats.
 *
 * Layers:
 * - 0 (Low): ~100 kbps, 1/4 resolution
 * - 1 (Mid): ~300 kbps, 1/2 resolution
 * - 2 (High): ~900 kbps, full resolution
 */

const LAYERS = [
  { id: 0, label: "Low", targetBitrate: 100, scale: "1/4", color: "#EAB308", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
  { id: 1, label: "Mid", targetBitrate: 300, scale: "1/2", color: "#3B82F6", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  { id: 2, label: "High", targetBitrate: 900, scale: "Full", color: "#22C55E", bg: "bg-green-500/10", border: "border-green-500/20" },
];

function fmt(val) {
  if (val == null || isNaN(val)) return "--";
  return Math.round(val);
}

export default function SimulcastSwitcher({
  participants,
  peerStats,
  sendTransportRef,
  signalingClientRef,
}) {
  const [expanded, setExpanded] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [outboundLayers, setOutboundLayers] = useState([]);
  const [forcedLayers, setForcedLayers] = useState(new Map()); // consumerId → spatialLayer
  const prevRef = useRef(new Map());

  // Poll outbound simulcast layer stats
  useEffect(() => {
    const poll = async () => {
      const transport = sendTransportRef?.current;
      if (!transport || transport.connectionState !== "connected") return;

      let report;
      try {
        report = await transport.getStats();
      } catch {
        return;
      }

      const layers = [];
      const now = Date.now();

      report.forEach((stat) => {
        if (stat.type === "outbound-rtp" && stat.kind === "video") {
          const prev = prevRef.current.get(stat.rid || stat.id);
          const deltaMs = prev ? now - prev.ts : 0;
          let bitrate = 0;

          if (prev && deltaMs > 0) {
            const deltaBytes = (stat.bytesSent || 0) - (prev.bytes || 0);
            bitrate = deltaBytes > 0 ? (deltaBytes * 8) / (deltaMs / 1000) / 1000 : 0;
          }

          prevRef.current.set(stat.rid || stat.id, {
            bytes: stat.bytesSent || 0,
            ts: now,
          });

          layers.push({
            rid: stat.rid,
            ssrc: stat.ssrc,
            bitrate,
            fps: stat.framesPerSecond ?? null,
            width: stat.frameWidth ?? null,
            height: stat.frameHeight ?? null,
            qualityLimitationReason: stat.qualityLimitationReason || "none",
            active: stat.bytesSent > 0 && bitrate > 0,
            scalabilityMode: stat.scalabilityMode || null,
          });
        }
      });

      // Sort layers by bitrate (ascending: low → mid → high)
      layers.sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0));
      setOutboundLayers(layers);
    };

    const interval = setInterval(poll, 1500);
    poll();
    return () => clearInterval(interval);
  }, [sendTransportRef]);

  // Switch layer for a consumer
  const switchLayer = useCallback((consumerId, spatialLayer) => {
    const client = signalingClientRef?.current;
    if (!client) return;

    client.sendSetPreferredLayers(consumerId, spatialLayer);
    setForcedLayers((prev) => {
      const next = new Map(prev);
      next.set(consumerId, spatialLayer);
      return next;
    });
  }, [signalingClientRef]);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">Simulcast Layers</span>
          {outboundLayers.length > 0 && (
            <span className="text-[9px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-medium">
              {outboundLayers.filter((l) => l.active).length}/{outboundLayers.length} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowInfo(!showInfo)} className="text-gray-600 hover:text-gray-400 p-0.5">
            <Info className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setExpanded(!expanded)} className="text-gray-500 hover:text-gray-300 p-0.5">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {showInfo && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 mb-2 text-[11px] text-gray-300 leading-relaxed">
          <div className="flex justify-between items-start mb-1">
            <span className="font-semibold text-white">What is Simulcast?</span>
            <button onClick={() => setShowInfo(false)} className="text-gray-500 hover:text-gray-300">
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="mb-1">
            Your camera encodes 3 versions of the same video simultaneously at different qualities (spatial layers).
            The SFU server decides which layer to forward to each viewer based on their available bandwidth.
          </p>
          <p className="mb-1">
            <span className="text-yellow-400">Low (100kbps)</span> = quarter resolution, for very slow connections.
            <span className="text-blue-400"> Mid (300kbps)</span> = half resolution, balanced.
            <span className="text-green-400"> High (900kbps)</span> = full resolution, best quality.
          </p>
          <p>
            Click a layer below to <span className="text-white font-medium">force</span> the SFU to send that layer
            to you — even if your bandwidth could handle higher. Watch the bitrate and resolution change in real-time!
          </p>
        </div>
      )}

      {expanded && (
        <div className="space-y-3">
          {/* Your outbound layers */}
          <div>
            <p className="text-[10px] font-medium text-gray-400 mb-1.5">Your Outbound (encoding {outboundLayers.length} layers)</p>
            <div className="grid grid-cols-3 gap-1.5">
              {outboundLayers.length > 0 ? outboundLayers.map((layer, i) => {
                const config = LAYERS[i] || LAYERS[2];
                return (
                  <div
                    key={layer.rid || i}
                    className={`${config.bg} ${config.border} border rounded-lg px-2 py-1.5 text-center ${
                      layer.active ? "" : "opacity-40"
                    }`}
                  >
                    <div className="text-[10px] font-medium" style={{ color: config.color }}>
                      {config.label}
                    </div>
                    <div className="text-[10px] font-mono text-gray-300">
                      {fmt(layer.bitrate)}k
                    </div>
                    {layer.width && (
                      <div className="text-[8px] text-gray-500">
                        {layer.width}x{layer.height}
                      </div>
                    )}
                    {layer.fps != null && (
                      <div className="text-[8px] text-gray-600">{layer.fps}fps</div>
                    )}
                    {!layer.active && (
                      <div className="text-[7px] text-gray-600 mt-0.5">inactive</div>
                    )}
                  </div>
                );
              }) : (
                <p className="col-span-3 text-[10px] text-gray-600">Waiting for video producer...</p>
              )}
            </div>
          </div>

          {/* Per-peer inbound layer control */}
          {participants.size > 0 && (
            <div>
              <p className="text-[10px] font-medium text-gray-400 mb-1.5">
                Inbound Layer Control (click to force-switch)
              </p>
              <div className="space-y-1.5">
                {Array.from(participants.entries()).map(([peerId, peer]) => {
                  const stat = peerStats?.get(peerId);
                  // Find the video consumer for this peer
                  let videoConsumerId = null;
                  for (const [cId, consumer] of peer.consumers) {
                    if (consumer.kind === "video" && consumer.appData?.type !== "screen") {
                      videoConsumerId = cId;
                      break;
                    }
                  }

                  if (!videoConsumerId) return null;

                  const currentForced = forcedLayers.get(videoConsumerId);

                  return (
                    <div key={peerId} className="bg-gray-800/30 rounded-lg px-2.5 py-1.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-gray-400">{peer.displayName || "Guest"}</span>
                        {stat && (
                          <span className="text-[9px] font-mono text-gray-500">
                            {fmt(stat.videoBitrate)}k · {stat.resolution || "?"}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {LAYERS.map((layer) => {
                          const isForced = currentForced === layer.id;
                          return (
                            <button
                              key={layer.id}
                              onClick={() => switchLayer(videoConsumerId, layer.id)}
                              className={`flex-1 text-[9px] py-1 rounded border font-medium transition-colors ${
                                isForced
                                  ? `${layer.bg} ${layer.border} border-2`
                                  : "bg-gray-800/50 border-gray-700/50 text-gray-500 hover:text-gray-300 hover:border-gray-600"
                              }`}
                              style={isForced ? { color: layer.color } : {}}
                            >
                              {layer.label}
                              <span className="block text-[7px] opacity-70">{layer.targetBitrate}k</span>
                            </button>
                          );
                        })}
                        <button
                          onClick={() => switchLayer(videoConsumerId, 2)} // reset to auto (highest)
                          className={`px-2 text-[8px] rounded border ${
                            currentForced == null
                              ? "bg-gray-700/30 border-gray-600/50 text-gray-400"
                              : "bg-gray-800/50 border-gray-700/50 text-gray-600 hover:text-gray-300"
                          }`}
                        >
                          Auto
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {participants.size === 0 && (
            <p className="text-[10px] text-gray-600">Layer switching will be available when peers join...</p>
          )}
        </div>
      )}
    </div>
  );
}
