import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { MonitorUp, ExternalLink, Maximize, Minimize } from "lucide-react";
import ParticipantTile from "./ParticipantTile";

/**
 * VideoPanel — Multi-participant video grid with presentation mode.
 *
 * Grid layout adapts to participant count:
 * - 1: centered
 * - 2: side-by-side
 * - 3-4: 2×2
 * - 5-6: 3×2
 * - 7-9: 3×3
 * - 10: 4×3
 *
 * When someone is screen-sharing, switches to presentation mode:
 * screen share takes ~75% of space, camera tiles go into a sidebar.
 */
export default function VideoPanel({
  localStream,
  participants,
  isVideoEnabled,
  isAudioEnabled,
  isScreenSharing,
  screenStream,
}) {
  const containerRef = useRef(null);
  const screenPreviewRef = useRef(null);
  const popoutWindowRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Find who is screen sharing (including self)
  const screenSharer = useMemo(() => {
    if (isScreenSharing) return { type: "local", stream: screenStream };
    for (const [peerId, peer] of participants) {
      if (peer.isScreenSharing && peer.screenTrack) {
        return { type: "remote", peerId, track: peer.screenTrack };
      }
    }
    return null;
  }, [isScreenSharing, screenStream, participants]);

  // Attach screen preview for local sharer
  useEffect(() => {
    if (screenPreviewRef.current && screenStream) {
      screenPreviewRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  // Close popout when screen share stops
  useEffect(() => {
    if (!screenSharer && popoutWindowRef.current && !popoutWindowRef.current.closed) {
      popoutWindowRef.current.postMessage({ type: "popout-stream-ended" }, "*");
      popoutWindowRef.current = null;
    }
  }, [screenSharer]);

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  useEffect(() => {
    return () => {
      if (popoutWindowRef.current && !popoutWindowRef.current.closed) {
        popoutWindowRef.current.close();
      }
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }, []);

  // Build the list of all tiles (local + remote participants)
  const tiles = useMemo(() => {
    const result = [];

    // Local tile
    const localVideoTrack = localStream?.getVideoTracks()[0] || null;
    const localAudioTrack = localStream?.getAudioTracks()[0] || null;
    result.push({
      key: "local",
      isLocal: true,
      displayName: "You",
      videoTrack: localVideoTrack,
      audioTrack: localAudioTrack,
      isVideoEnabled,
      isAudioEnabled,
      isScreenSharing,
    });

    // Remote tiles
    for (const [peerId, peer] of participants) {
      result.push({
        key: peerId,
        isLocal: false,
        displayName: peer.displayName || "Guest",
        videoTrack: peer.videoTrack,
        audioTrack: peer.audioTrack,
        isVideoEnabled: peer.isVideoEnabled !== false,
        isAudioEnabled: peer.isAudioEnabled !== false,
        isScreenSharing: peer.isScreenSharing || false,
      });
    }

    return result;
  }, [localStream, participants, isVideoEnabled, isAudioEnabled, isScreenSharing]);

  // Compute grid columns based on participant count
  const gridCols = useMemo(() => {
    const count = tiles.length;
    if (count <= 1) return "grid-cols-1";
    if (count <= 2) return "grid-cols-2";
    if (count <= 4) return "grid-cols-2";
    if (count <= 6) return "grid-cols-3";
    if (count <= 9) return "grid-cols-3";
    return "grid-cols-4";
  }, [tiles.length]);

  // ── Presentation mode (someone is screen sharing) ──
  if (screenSharer) {
    return (
      <div ref={containerRef} className="relative w-full h-full bg-gray-950 rounded-2xl overflow-hidden flex">
        {/* Main screen share area */}
        <div className="flex-1 relative min-w-0">
          {screenSharer.type === "local" ? (
            <video
              ref={screenPreviewRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain bg-black"
            />
          ) : (
            <ScreenShareVideo track={screenSharer.track} />
          )}

          {/* Presenting label + controls */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 bg-blue-600/80 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-lg">
              <MonitorUp className="w-3.5 h-3.5" />
              {screenSharer.type === "local" ? "You are presenting" : "Presenting"}
            </div>
            <div className="flex items-center gap-2 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                onClick={toggleFullscreen}
                className="flex items-center gap-1.5 bg-gray-800/80 hover:bg-gray-700/80 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{isFullscreen ? "Exit" : "Enlarge"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar with camera tiles */}
        <div className="w-44 sm:w-52 shrink-0 flex flex-col gap-1.5 p-1.5 overflow-y-auto bg-gray-950">
          {tiles.map((tile) => (
            <div key={tile.key} className="aspect-video shrink-0">
              <ParticipantTile
                displayName={tile.displayName}
                videoTrack={tile.videoTrack}
                audioTrack={tile.audioTrack}
                isVideoEnabled={tile.isVideoEnabled}
                isAudioEnabled={tile.isAudioEnabled}
                isLocal={tile.isLocal}
                isScreenSharing={tile.isScreenSharing}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Normal grid mode ──
  return (
    <div ref={containerRef} className="relative w-full h-full bg-gray-950 rounded-2xl overflow-hidden p-1.5">
      <div className={`grid ${gridCols} gap-1.5 w-full h-full auto-rows-fr`}>
        {tiles.map((tile) => (
          <ParticipantTile
            key={tile.key}
            displayName={tile.displayName}
            videoTrack={tile.videoTrack}
            audioTrack={tile.audioTrack}
            isVideoEnabled={tile.isVideoEnabled}
            isAudioEnabled={tile.isAudioEnabled}
            isLocal={tile.isLocal}
            isScreenSharing={tile.isScreenSharing}
          />
        ))}
      </div>

      {/* Fullscreen button */}
      <div className="absolute top-3 right-3 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          onClick={toggleFullscreen}
          className="flex items-center gap-1.5 bg-gray-800/80 hover:bg-gray-700/80 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isFullscreen ? "Exit" : "Enlarge"}</span>
        </button>
      </div>
    </div>
  );
}

/**
 * ScreenShareVideo — Renders a remote screen share track.
 */
function ScreenShareVideo({ track }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && track) {
      videoRef.current.srcObject = new MediaStream([track]);
    }
  }, [track]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="w-full h-full object-contain bg-black"
    />
  );
}
