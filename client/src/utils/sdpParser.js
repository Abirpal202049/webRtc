/**
 * sdpParser — Parses SDP text into structured, annotated sections.
 *
 * SDP (Session Description Protocol) is the "DNA" of a WebRTC session.
 * Each line is type=value format. This parser annotates every line with
 * a human-readable explanation.
 */

const ANNOTATIONS = {
  "v=": "Protocol version (always 0)",
  "o=": "Origin — session creator, session ID, version, network type, address",
  "s=": "Session name (usually '-' for WebRTC)",
  "t=": "Timing — start and end time (0 0 = permanent session)",
  "c=": "Connection data — network type, address type, address",
  "a=group:BUNDLE": "BUNDLE — multiplexes all media over a single transport (saves ports)",
  "a=msid-semantic": "Media stream identification semantics",
  "a=ice-ufrag": "ICE username fragment — used to identify this ICE agent in connectivity checks",
  "a=ice-pwd": "ICE password — HMAC key for authenticating ICE connectivity checks",
  "a=ice-options": "ICE options (trickle = send candidates as they're discovered)",
  "a=fingerprint": "DTLS certificate fingerprint — used to verify the encryption handshake",
  "a=setup": "DTLS role — 'actpass' means can be client or server, 'active' initiates",
  "a=mid": "Media ID — unique identifier for this media section within the BUNDLE",
  "a=sendrecv": "Direction — both sending and receiving media",
  "a=sendonly": "Direction — only sending, not receiving",
  "a=recvonly": "Direction — only receiving, not sending",
  "a=inactive": "Direction — neither sending nor receiving",
  "a=rtcp-mux": "Multiplex RTP and RTCP on the same port (instead of RTP on port N, RTCP on N+1)",
  "a=rtcp-rsize": "Reduced-size RTCP — smaller feedback packets for efficiency",
  "a=extmap": "RTP header extension mapping — extends RTP with additional metadata",
  "a=ssrc": "Synchronization Source — unique ID for this media stream",
  "a=ssrc-group": "Groups related SSRCs (e.g., FID = Flow Identification for retransmission)",
  "a=rtcp-fb": "RTCP feedback capability — what feedback mechanisms are supported",
  "a=fmtp": "Format parameters — codec-specific settings",
  "a=candidate": "ICE candidate — a potential network path for media",
  "a=end-of-candidates": "All ICE candidates have been gathered",
  "a=sctp-port": "SCTP port for DataChannels",
  "a=max-message-size": "Maximum DataChannel message size",
};

const CODEC_ANNOTATIONS = {
  VP8: "VP8 — Google's open video codec, widely supported, good for real-time",
  VP9: "VP9 — Successor to VP8, better compression but more CPU-intensive",
  H264: "H264/AVC — Most widely used video codec, hardware acceleration on most devices",
  opus: "Opus — Versatile audio codec, excellent at low bitrates, standard for WebRTC",
  red: "RED (Redundant Audio) — Duplicates audio packets for resilience against loss",
  ulpfec: "ULPFEC — Forward Error Correction for video, recovers lost packets without retransmission",
  flexfec: "FlexFEC — Flexible FEC, newer and more efficient than ULPFEC",
  rtx: "RTX — Retransmission, resends lost packets on a separate stream",
  "telephone-event": "DTMF tones — the beeps when you press phone number keys",
};

const SECTION_COLORS = {
  session: { bg: "bg-gray-500/10", border: "border-gray-500/20", text: "text-gray-400" },
  video: { bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-400" },
  audio: { bg: "bg-green-500/10", border: "border-green-500/20", text: "text-green-400" },
  application: { bg: "bg-purple-500/10", border: "border-purple-500/20", text: "text-purple-400" },
  ice: { bg: "bg-cyan-500/10", border: "border-cyan-500/20", text: "text-cyan-400" },
  dtls: { bg: "bg-yellow-500/10", border: "border-yellow-500/20", text: "text-yellow-400" },
  codec: { bg: "bg-indigo-500/10", border: "border-indigo-500/20", text: "text-indigo-400" },
};

export function parseSdp(sdpText) {
  if (!sdpText) return null;

  const lines = sdpText.split("\r\n").filter(Boolean);
  const parsed = [];
  let currentSection = "session";
  let currentMediaType = null;
  const codecs = [];

  for (const line of lines) {
    // Detect media section changes
    if (line.startsWith("m=audio")) {
      currentSection = "audio";
      currentMediaType = "audio";
    } else if (line.startsWith("m=video")) {
      currentSection = "video";
      currentMediaType = "video";
    } else if (line.startsWith("m=application")) {
      currentSection = "application";
      currentMediaType = "application";
    }

    // Determine line category
    let category = currentSection;
    if (line.startsWith("a=ice-") || line.startsWith("a=candidate")) category = "ice";
    if (line.startsWith("a=fingerprint") || line.startsWith("a=setup")) category = "dtls";
    if (line.startsWith("a=rtpmap") || line.startsWith("a=fmtp") || line.startsWith("a=rtcp-fb")) category = "codec";

    // Find annotation
    let annotation = null;
    for (const [prefix, desc] of Object.entries(ANNOTATIONS)) {
      if (line.startsWith(prefix)) {
        annotation = desc;
        break;
      }
    }

    // Special: rtpmap codec annotation
    if (line.startsWith("a=rtpmap:")) {
      const codecMatch = line.match(/a=rtpmap:\d+\s+(\S+)/);
      if (codecMatch) {
        const codecName = codecMatch[1].split("/")[0];
        annotation = CODEC_ANNOTATIONS[codecName] || `Codec: ${codecName}`;
        codecs.push({
          name: codecName,
          mediaType: currentMediaType,
          fullLine: line,
        });
      }
    }

    parsed.push({
      raw: line,
      section: currentSection,
      category,
      colors: SECTION_COLORS[category] || SECTION_COLORS.session,
      annotation,
      isMediaLine: line.startsWith("m="),
    });
  }

  return { lines: parsed, codecs };
}
