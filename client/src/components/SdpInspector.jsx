import { useState, useEffect, useRef } from "react";
import { FileText, ChevronDown, ChevronRight, Info, X } from "lucide-react";
import { parseSdp } from "../utils/sdpParser";

/**
 * SdpInspector — Parsed, annotated, color-coded SDP viewer.
 *
 * Reads real SDP from mediasoup transport's internal RTCPeerConnection.
 * Every line is annotated with a human-readable explanation.
 */

export default function SdpInspector({ sendTransportRef, recvTransportRef }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("send-local");
  const [sdpData, setSdpData] = useState({});
  const [showInfo, setShowInfo] = useState(false);
  const pollRef = useRef(null);

  // Extract SDP from transport internals
  useEffect(() => {
    const collect = () => {
      const data = {};

      try {
        const sendPc = sendTransportRef?.current?._handler?._pc;
        if (sendPc) {
          data.sendLocal = sendPc.localDescription?.sdp || null;
          data.sendRemote = sendPc.remoteDescription?.sdp || null;
        }
      } catch { /* internal access may fail */ }

      try {
        const recvPc = recvTransportRef?.current?._handler?._pc;
        if (recvPc) {
          data.recvLocal = recvPc.localDescription?.sdp || null;
          data.recvRemote = recvPc.remoteDescription?.sdp || null;
        }
      } catch { /* internal access may fail */ }

      setSdpData(data);
    };

    collect();
    pollRef.current = setInterval(collect, 5000);
    return () => clearInterval(pollRef.current);
  }, [sendTransportRef, recvTransportRef]);

  const tabs = [
    { id: "send-local", label: "Send (Local)", sdp: sdpData.sendLocal },
    { id: "send-remote", label: "Send (Remote)", sdp: sdpData.sendRemote },
    { id: "recv-local", label: "Recv (Local)", sdp: sdpData.recvLocal },
    { id: "recv-remote", label: "Recv (Remote)", sdp: sdpData.recvRemote },
  ];

  const activeTabData = tabs.find((t) => t.id === activeTab);
  const parsed = activeTabData?.sdp ? parseSdp(activeTabData.sdp) : null;

  const hasSdp = Object.values(sdpData).some(Boolean);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">SDP Inspector</span>
          {hasSdp && (
            <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-medium">
              {parsed?.lines?.length || 0} lines
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
            <span className="font-semibold text-white">What is SDP?</span>
            <button onClick={() => setShowInfo(false)} className="text-gray-500 hover:text-gray-300">
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="mb-1">
            SDP (Session Description Protocol) is the "DNA" of a WebRTC session. It describes everything:
            which codecs to use, encryption fingerprints, ICE credentials, media capabilities, and RTP extensions.
          </p>
          <p className="mb-1">
            Each transport has a Local Description (what YOU offer/answer) and a Remote Description (what the SFU offers/answers).
            The "Send" transport carries your media OUT, the "Recv" transport brings others' media IN.
          </p>
          <p>
            Hover over any line to see what it means. Color coding:
            <span className="text-gray-400"> gray=session</span>,
            <span className="text-blue-400"> blue=video</span>,
            <span className="text-green-400"> green=audio</span>,
            <span className="text-cyan-400"> cyan=ICE</span>,
            <span className="text-yellow-400"> yellow=DTLS</span>,
            <span className="text-indigo-400"> purple=codec</span>.
          </p>
        </div>
      )}

      {expanded && (
        <>
          {/* Tab bar */}
          <div className="flex border-b border-gray-800 mb-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 text-[9px] font-medium py-1.5 transition-colors ${
                  activeTab === tab.id
                    ? "text-purple-400 border-b-2 border-purple-400"
                    : "text-gray-600 hover:text-gray-400"
                } ${!tab.sdp ? "opacity-40" : ""}`}
                disabled={!tab.sdp}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {!parsed ? (
            <p className="text-[10px] text-gray-600">
              {hasSdp ? "Select a tab with SDP data" : "SDP will appear once the transport is connected..."}
            </p>
          ) : (
            <>
              {/* Codec summary */}
              {parsed.codecs.length > 0 && (
                <div className="bg-indigo-500/5 border border-indigo-500/15 rounded-lg px-2.5 py-1.5 mb-2">
                  <p className="text-[9px] font-medium text-indigo-400 mb-0.5">Negotiated Codecs</p>
                  <div className="flex flex-wrap gap-1">
                    {parsed.codecs.map((c, i) => (
                      <span
                        key={i}
                        className={`text-[8px] px-1.5 py-0.5 rounded font-mono ${
                          c.mediaType === "video" ? "bg-blue-500/15 text-blue-400" : "bg-green-500/15 text-green-400"
                        }`}
                      >
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* SDP lines */}
              <div className="max-h-64 overflow-y-auto space-y-0 font-mono text-[9px]">
                {parsed.lines.map((line, i) => (
                  <div
                    key={i}
                    className={`group relative flex items-start gap-1 px-1.5 py-0.5 rounded hover:bg-gray-800/50 ${
                      line.isMediaLine ? "mt-2 pt-1 border-t border-gray-800" : ""
                    }`}
                  >
                    {/* Line number */}
                    <span className="text-gray-700 w-5 text-right shrink-0 select-none">{i + 1}</span>

                    {/* Color dot */}
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${line.colors.text.replace("text-", "bg-")}`} />

                    {/* SDP text */}
                    <span className={`${line.colors.text} break-all`}>{line.raw}</span>

                    {/* Annotation tooltip */}
                    {line.annotation && (
                      <div className="hidden group-hover:block absolute left-0 bottom-full z-50 w-64 bg-gray-800 border border-gray-700 rounded-lg p-2 shadow-xl text-[10px] text-gray-300 leading-relaxed">
                        {line.annotation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {!expanded && hasSdp && (
        <p className="text-[10px] text-gray-600">Click to expand and inspect the raw SDP...</p>
      )}
    </div>
  );
}
