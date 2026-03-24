import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  Wifi,
  MonitorUp,
  MonitorDown,
  AudioLines,
  ChevronDown,
  ChevronRight,
  Info,
  X,
} from "lucide-react";
import Sparkline from "./Sparkline";

/**
 * MetricsDashboard — Real-time WebRTC performance metrics.
 *
 * All data comes from RTCPeerConnection.getStats() — the browser's
 * built-in statistics API. Nothing is hardcoded.
 *
 * Each metric has an info icon that explains what it means in
 * simple language that even a school student can understand.
 */

// ── Kid-friendly explanations for every metric ──

const INFO = {
  rtt: {
    title: "Round-Trip Time (RTT)",
    text: "Imagine you shout across a canyon and wait for the echo to come back. RTT is how long that takes — it measures the time for a tiny message to travel from your computer to the other person's computer and back. Lower is better! Under 100ms feels instant, like talking face-to-face. Over 300ms feels laggy, like a bad phone call with awkward pauses.",
    example: "If RTT is 50ms, your video reaches the other person in about 25ms — that's faster than the blink of an eye!",
  },
  bandwidth: {
    title: "Available Bandwidth",
    text: "Think of bandwidth like a water pipe. A bigger pipe can carry more water at once. Bandwidth tells you how much data your internet connection can send right now. It's measured in kbps (kilobits per second). More bandwidth = better video quality. If it drops too low, your video might get blurry or freeze.",
    example: "720p video needs about 1,500 kbps. If your bandwidth is only 500 kbps, the video will automatically lower its quality to keep things smooth.",
  },
  connectionType: {
    title: "Connection Type",
    text: "This tells you HOW the two computers are connected. 'host' means a direct connection on the same network (like two people in the same room). 'srflx' (server-reflexive) means the computers found each other's public address using a helper server called STUN — like asking a friend to relay your phone number. 'relay' means all data goes through a middleman server (TURN) — slower but works when direct connection isn't possible.",
    example: "Direct connections (host/srflx) are like passing a note directly to your friend. Relay is like giving the note to a teacher who walks it over — it works, but it's slower.",
  },
  localAddress: {
    title: "Local Address",
    text: "This is YOUR computer's network address — like your home address, but for the internet. It shows the IP address and port number that your computer is using to send and receive video data. The port is like an apartment number inside your building.",
    example: "192.168.1.5:54321 means your computer's local IP is 192.168.1.5 and it's using door number 54321 for this call.",
  },
  remoteAddress: {
    title: "Remote Address",
    text: "This is the OTHER person's network address — where your video data is being sent to. Just like how you need someone's home address to mail them a letter, your computer needs this address to send video to them.",
    example: "If this shows a public IP like 203.0.113.10:12345, it means the other person is on a different network and data travels across the internet to reach them.",
  },
  videoSendBitrate: {
    title: "Video Send Bitrate",
    text: "This is how much video data you're sending to the other person every second. Think of it like how fast you're talking — a higher bitrate means you're sending more detail in each frame, so the video looks sharper and clearer on their screen. It goes up and down automatically based on your internet speed.",
    example: "At 1,000 kbps you're sending about 125 kilobytes of video every second — that's like sending a small photo every second!",
  },
  videoSendResolution: {
    title: "Video Resolution (Sending)",
    text: "Resolution is the size of the video picture you're sending, measured in pixels (tiny dots that make up the image). More pixels = sharper picture. 1280x720 means 1,280 dots wide and 720 dots tall — that's called 720p or HD. The browser might lower this if your internet is slow, to keep things running smoothly.",
    example: "640x480 is like a small photo. 1280x720 is like a clear HD picture. 1920x1080 is Full HD — super sharp!",
  },
  videoSendFps: {
    title: "Frames Per Second (Sending)",
    text: "Video is actually lots of pictures shown really fast, like a flipbook! FPS tells you how many pictures (frames) your camera captures and sends every second. 30 FPS means 30 pictures per second — smooth like a movie. 15 FPS looks a bit choppy. Below 10 FPS looks like a slideshow.",
    example: "Movies play at 24 FPS. Video games aim for 60 FPS. Video calls usually target 30 FPS — that's already smooth enough for talking!",
  },
  videoCodec: {
    title: "Video Codec",
    text: "A codec is like a language that both computers agree to speak. Raw video is HUGE — one second of uncompressed HD video would be over 100 MB! The codec (like VP8, VP9, or H264) squeezes it down to a tiny fraction of that size so it can travel through the internet. Both sides must use the same codec to understand each other.",
    example: "VP8 is like writing in shorthand — it's fast to write and read. H264 is like using abbreviations — slightly better quality but needs more brain power to decode.",
  },
  qualityLimit: {
    title: "Quality Limitation Reason",
    text: "This tells you if something is holding back your video quality. 'none' means everything is great — no limits! 'bandwidth' means your internet is too slow, so the browser is reducing quality to avoid freezing. 'cpu' means your computer's processor is working too hard (maybe too many tabs open!) and can't encode video fast enough.",
    example: "If this shows 'cpu', try closing other apps or browser tabs. If it shows 'bandwidth', try moving closer to your WiFi router!",
  },
  videoRecvBitrate: {
    title: "Video Receive Bitrate",
    text: "This is how much video data you're receiving FROM the other person every second. If they have good internet and a nice camera, this number will be high and their video will look sharp. If it drops, their video might get blurry on your screen.",
    example: "If the other person is sending 1,200 kbps but you're only receiving 800 kbps, some data might be getting lost on the way — like letters lost in the mail.",
  },
  videoRecvResolution: {
    title: "Video Resolution (Receiving)",
    text: "This is the size of the video picture you're receiving from the other person. It might be different from what they're sending if the quality was lowered during transmission. Think of it like receiving a photo — sometimes it arrives at full size, sometimes it's been shrunk to fit through a small mailbox (slow internet).",
    example: "If the other person has a 1080p camera but slow internet, you might only receive 480p — still watchable but not as crisp.",
  },
  videoRecvFps: {
    title: "Frames Per Second (Receiving)",
    text: "How many video pictures per second you're getting from the other person. If their camera sends 30 FPS but packets get lost or delayed, you might only see 25 or 20 FPS. The lower this goes, the choppier their video looks on your screen.",
    example: "If this suddenly drops from 30 to 10, the other person's video will look like it's stuttering — like a slow-loading GIF.",
  },
  packetLoss: {
    title: "Packet Loss",
    text: "When data travels through the internet, it's split into small chunks called 'packets' — like pages of a letter sent separately. Sometimes packets get lost along the way and never arrive! Packet loss tells you what percentage of packets disappeared. A little bit (under 1%) is normal and invisible. Over 5% and you'll see glitches, frozen frames, or hear robot-like audio.",
    example: "If you sent 100 packets and 2 got lost, that's 2% packet loss. Imagine reading a book where 2 out of every 100 words are missing — you can still understand, but it's annoying!",
  },
  videoJitter: {
    title: "Video Jitter",
    text: "Imagine clapping at a steady beat — clap, clap, clap, evenly spaced. Now imagine sometimes the claps come too fast and sometimes too slow. That unevenness is 'jitter.' In video, packets should arrive at a steady rhythm. Jitter means they arrive at uneven intervals, which can cause the video to stutter or look jerky.",
    example: "Low jitter (under 30ms) = smooth video. High jitter (over 100ms) = video that freezes and then catches up in bursts.",
  },
  framesDropped: {
    title: "Frames Dropped",
    text: "Sometimes your computer receives a video frame but can't display it in time — maybe it was too busy doing other things. When this happens, it 'drops' the frame (skips it). A few dropped frames are fine — you won't even notice. But lots of dropped frames mean the video looks choppy or keeps freezing momentarily.",
    example: "If your computer dropped 5 frames out of 1,000, that's totally fine. If it's dropping 100 out of 1,000, something is struggling — maybe close some other apps!",
  },
  audioSendBitrate: {
    title: "Audio Send Bitrate",
    text: "How much audio data (your voice from the microphone) you're sending every second. Audio is much smaller than video — usually around 30-50 kbps. The Opus codec is really good at making your voice sound clear even with very little data. If this drops to zero, you're probably muted!",
    example: "A music streaming service uses about 128-320 kbps for songs. Voice calls only need 30 kbps — your voice is simpler than a full song!",
  },
  audioRecvBitrate: {
    title: "Audio Receive Bitrate",
    text: "How much audio data you're getting from the other person. If this is steady around 30-50 kbps, their microphone is working and their voice is coming through. If it drops to zero, they might be muted or disconnected.",
    example: "If you hear the other person clearly, this number is doing its job. If their voice keeps cutting out, check if this number is fluctuating wildly.",
  },
  audioCodec: {
    title: "Audio Codec",
    text: "Just like video has a codec, audio also needs one to compress your voice. 'Opus' is the most common one in WebRTC — it's amazing at making voices sound natural even at very low bitrates. It can also handle music well. Think of it as a translator that converts your voice into a super-efficient digital format.",
    example: "Opus at 32 kbps sounds almost as good as a phone call at 64 kbps — it's like a really efficient language!",
  },
  audioJitter: {
    title: "Audio Jitter",
    text: "Same concept as video jitter, but for sound. If audio packets arrive unevenly, you might hear the other person's voice as choppy or robotic-sounding. Your browser tries to smooth this out with a 'jitter buffer' (a tiny delay that re-arranges packets back into order), but if jitter is too high, even the buffer can't help.",
    example: "Under 20ms jitter = crystal clear voice. Over 50ms = you might hear some weird robotic effects or tiny gaps in speech.",
  },
  audioPacketLoss: {
    title: "Audio Packet Loss",
    text: "Percentage of audio packets that got lost in transit. Audio is more sensitive to packet loss than video — because your brain notices missing words more than missing video frames. Even 2-3% audio packet loss can make the other person sound garbled or like they're cutting out.",
    example: "Imagine listening to someone talk but every 50th word just vanishes. At 2% loss, that's what's happening to the audio!",
  },
};

// ── InfoPopover component ──

function InfoPopover({ infoKey, activePopover, setActivePopover }) {
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const isOpen = activePopover === infoKey;
  const info = INFO[infoKey];

  if (!info) return null;

  // Position the popover relative to the button, rendered in a portal
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const popoverWidth = 288; // w-72 = 18rem = 288px

    // Try to position above the button
    let top = rect.top - 8; // 8px gap above
    let left = rect.left;

    // Keep within viewport horizontally
    if (left + popoverWidth > window.innerWidth - 8) {
      left = window.innerWidth - popoverWidth - 8;
    }
    if (left < 8) left = 8;

    // If not enough room above, position below
    if (top < 200) {
      top = rect.bottom + 8;
    }

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
    const handleScroll = () => updatePosition();

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, setActivePopover, updatePosition]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setActivePopover(isOpen ? null : infoKey);
        }}
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
            <button
              onClick={() => setActivePopover(null)}
              className="text-gray-500 hover:text-gray-300 shrink-0"
            >
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

function qualityColor(value, thresholds) {
  if (value == null) return "text-gray-500";
  const { good, warn } = thresholds;
  if (typeof good === "number" && typeof warn === "number") {
    if (good < warn) {
      if (value <= good) return "text-green-400";
      if (value <= warn) return "text-yellow-400";
      return "text-red-400";
    }
    if (value >= good) return "text-green-400";
    if (value >= warn) return "text-yellow-400";
    return "text-red-400";
  }
  return "text-gray-300";
}

/**
 * Format a number with full precision — no hiding decimals.
 * For values near zero, shows all significant digits so you can see
 * exactly what's happening (e.g., 0.000045% instead of 0.00%).
 *
 * @param {number} val - The value
 * @param {string} suffix - Suffix like " ms", " kbps", "%"
 * @param {number} minDecimals - Minimum decimal places for non-tiny values
 */
function fmt(val, minDecimals = 0, suffix = "") {
  if (val == null) return "--";

  // For very small non-zero values, show full significant digits
  if (val !== 0 && Math.abs(val) < 0.01) {
    // Use toPrecision to show meaningful digits for tiny numbers
    return `${val.toPrecision(3)}${suffix}`;
  }

  // For values < 1 but >= 0.01, show enough decimals
  if (val !== 0 && Math.abs(val) < 1) {
    return `${val.toFixed(Math.max(minDecimals, 4))}${suffix}`;
  }

  // For larger values, use requested decimal places but at least 2 for fractional values
  if (val !== 0 && val % 1 !== 0) {
    return `${val.toFixed(Math.max(minDecimals, 2))}${suffix}`;
  }

  return `${val.toFixed(minDecimals)}${suffix}`;
}

function MetricRow({ label, value, color = "text-gray-300", sparkData, sparkColor, infoKey, activePopover, setActivePopover }) {
  return (
    <div className="flex items-center justify-between gap-1 py-0.5">
      <div className="flex items-center gap-1">
        {infoKey && (
          <InfoPopover
            infoKey={infoKey}
            activePopover={activePopover}
            setActivePopover={setActivePopover}
          />
        )}
        <span className="text-gray-500 text-[11px]">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {sparkData && sparkData.length > 1 && (
          <Sparkline data={sparkData} width={80} height={20} color={sparkColor || color} />
        )}
        <span className={`text-[11px] font-mono ${color} min-w-[60px] text-right`}>{value}</span>
      </div>
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
        {open ? (
          <ChevronDown className="w-3 h-3 text-gray-500" />
        ) : (
          <ChevronRight className="w-3 h-3 text-gray-500" />
        )}
      </button>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  );
}

// ── Main Dashboard ──

export default function MetricsDashboard({ stats, history }) {
  const [activePopover, setActivePopover] = useState(null);

  if (!stats) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">Performance</span>
        </div>
        <p className="text-xs text-gray-600">Metrics will appear once connected...</p>
      </div>
    );
  }

  const qualLimitColor =
    stats.qualityLimitationReason === "none" || !stats.qualityLimitationReason
      ? "text-green-400"
      : stats.qualityLimitationReason === "bandwidth"
        ? "text-yellow-400"
        : "text-red-400";

  const p = { activePopover, setActivePopover };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Activity className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-300">Performance</span>
      </div>

      {/* Connection */}
      <Section icon={Wifi} title="Connection">
        <MetricRow
          label="RTT"
          infoKey="rtt"
          value={fmt(stats.rtt, 0, " ms")}
          color={qualityColor(stats.rtt, { good: 100, warn: 300 })}
          sparkData={history.rtt}
          sparkColor="text-cyan-400"
          {...p}
        />
        <MetricRow
          label="Bandwidth"
          infoKey="bandwidth"
          value={stats.availableBitrate != null ? fmt(stats.availableBitrate, 0, " kbps") : "--"}
          color="text-gray-300"
          {...p}
        />
        <MetricRow
          label="Type"
          infoKey="connectionType"
          value={stats.connectionType ? `${stats.connectionType} / ${stats.transportProtocol || "?"}` : "--"}
          color={stats.connectionType === "relay" ? "text-yellow-400" : "text-green-400"}
          {...p}
        />
        <MetricRow
          label="Local"
          infoKey="localAddress"
          value={stats.localAddress || "--"}
          color="text-gray-400"
          {...p}
        />
        <MetricRow
          label="Remote"
          infoKey="remoteAddress"
          value={stats.remoteAddress || "--"}
          color="text-gray-400"
          {...p}
        />
      </Section>

      {/* Video Sending */}
      <Section icon={MonitorUp} title="Video (Sending)">
        <MetricRow
          label="Bitrate"
          infoKey="videoSendBitrate"
          value={fmt(stats.videoSendBitrate, 0, " kbps")}
          color={qualityColor(stats.videoSendBitrate, { good: 500, warn: 200 })}
          sparkData={history.videoSendBitrate}
          sparkColor="text-blue-400"
          {...p}
        />
        <MetricRow
          label="Resolution"
          infoKey="videoSendResolution"
          value={stats.videoWidthSent ? `${stats.videoWidthSent}x${stats.videoHeightSent}` : "--"}
          color="text-gray-300"
          {...p}
        />
        <MetricRow
          label="FPS"
          infoKey="videoSendFps"
          value={fmt(stats.videoFpsSent, 0)}
          color={qualityColor(stats.videoFpsSent, { good: 24, warn: 15 })}
          {...p}
        />
        <MetricRow
          label="Codec"
          infoKey="videoCodec"
          value={stats.videoCodecSent || "--"}
          color="text-gray-300"
          {...p}
        />
        <MetricRow
          label="Quality limit"
          infoKey="qualityLimit"
          value={stats.qualityLimitationReason || "none"}
          color={qualLimitColor}
          {...p}
        />
      </Section>

      {/* Video Receiving */}
      <Section icon={MonitorDown} title="Video (Receiving)">
        <MetricRow
          label="Bitrate"
          infoKey="videoRecvBitrate"
          value={fmt(stats.videoRecvBitrate, 0, " kbps")}
          color={qualityColor(stats.videoRecvBitrate, { good: 500, warn: 200 })}
          sparkData={history.videoRecvBitrate}
          sparkColor="text-purple-400"
          {...p}
        />
        <MetricRow
          label="Resolution"
          infoKey="videoRecvResolution"
          value={stats.videoWidthReceived ? `${stats.videoWidthReceived}x${stats.videoHeightReceived}` : "--"}
          color="text-gray-300"
          {...p}
        />
        <MetricRow
          label="FPS"
          infoKey="videoRecvFps"
          value={fmt(stats.videoFpsReceived, 0)}
          color={qualityColor(stats.videoFpsReceived, { good: 24, warn: 15 })}
          sparkData={history.videoFpsRecv}
          sparkColor="text-green-400"
          {...p}
        />
        <MetricRow
          label="Packet loss"
          infoKey="packetLoss"
          value={fmt(stats.videoPacketLossPercent, 2, "%")}
          color={qualityColor(stats.videoPacketLossPercent, { good: 1, warn: 5 })}
          sparkData={history.packetLoss}
          sparkColor="text-red-400"
          {...p}
        />
        <MetricRow
          label="Jitter"
          infoKey="videoJitter"
          value={fmt(stats.videoJitter, 1, " ms")}
          color={qualityColor(stats.videoJitter, { good: 30, warn: 100 })}
          {...p}
        />
        <MetricRow
          label="Frames dropped"
          infoKey="framesDropped"
          value={stats.framesDropped != null ? `${stats.framesDropped}` : "--"}
          color={stats.framesDropped > 0 ? "text-yellow-400" : "text-gray-300"}
          {...p}
        />
        <MetricRow
          label="Pkts recv/interval"
          value={`${stats.deltaVideoPacketsReceived ?? 0}`}
          color="text-gray-400"
          {...p}
        />
        <MetricRow
          label="Pkts lost/interval"
          value={`${stats.deltaVideoPacketsLost ?? 0}`}
          color={stats.deltaVideoPacketsLost > 0 ? "text-red-400" : "text-gray-400"}
          {...p}
        />
      </Section>

      {/* Audio */}
      <Section icon={AudioLines} title="Audio">
        <MetricRow
          label="Send"
          infoKey="audioSendBitrate"
          value={fmt(stats.audioSendBitrate, 0, " kbps")}
          color="text-gray-300"
          {...p}
        />
        <MetricRow
          label="Receive"
          infoKey="audioRecvBitrate"
          value={fmt(stats.audioRecvBitrate, 0, " kbps")}
          color="text-gray-300"
          {...p}
        />
        <MetricRow
          label="Codec"
          infoKey="audioCodec"
          value={stats.audioCodecSent || stats.audioCodecReceived || "--"}
          color="text-gray-300"
          {...p}
        />
        <MetricRow
          label="Jitter"
          infoKey="audioJitter"
          value={fmt(stats.audioJitter, 1, " ms")}
          color={qualityColor(stats.audioJitter, { good: 20, warn: 50 })}
          sparkData={history.audioJitter}
          sparkColor="text-yellow-400"
          {...p}
        />
        <MetricRow
          label="Packet loss"
          infoKey="audioPacketLoss"
          value={fmt(stats.audioPacketLossPercent, 2, "%")}
          color={qualityColor(stats.audioPacketLossPercent, { good: 1, warn: 5 })}
          {...p}
        />
        <MetricRow
          label="Pkts recv/interval"
          value={`${stats.deltaAudioPacketsReceived ?? 0}`}
          color="text-gray-400"
          {...p}
        />
        <MetricRow
          label="Pkts lost/interval"
          value={`${stats.deltaAudioPacketsLost ?? 0}`}
          color={stats.deltaAudioPacketsLost > 0 ? "text-red-400" : "text-gray-400"}
          {...p}
        />
      </Section>
    </div>
  );
}
