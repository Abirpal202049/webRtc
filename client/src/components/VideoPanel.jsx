import { useEffect, useRef, useCallback, useState } from "react";
import { UserRound, VideoOff, MonitorUp, ExternalLink, Maximize, Minimize } from "lucide-react";

/**
 * VideoPanel — Displays local and remote video streams.
 *
 * Screen share handling:
 * - Sharer sees a preview of what they're sharing in the local PiP
 * - Viewer sees the shared screen as the main view with object-contain
 * - Both can pop out the screen share into a separate window
 * - Both can enlarge to fullscreen
 */
export default function VideoPanel({
  localStream,
  remoteStream,
  connectionState,
  isRemoteVideoEnabled,
  isVideoEnabled,
  isScreenSharing,
  isRemoteScreenSharing,
  screenStream,
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const screenPreviewRef = useRef(null);
  const containerRef = useRef(null);
  const popoutWindowRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Attach local camera stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Attach remote stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    // Keep global in sync for popout
    if (remoteStream) {
      window.__popoutStream = remoteStream;
    }
  }, [remoteStream]);

  // Attach screen share preview for the sharer
  useEffect(() => {
    if (screenPreviewRef.current && screenStream) {
      screenPreviewRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  // Close popout when screen share stops
  useEffect(() => {
    const noScreenShare = !isRemoteScreenSharing && !isScreenSharing;
    if (noScreenShare && popoutWindowRef.current && !popoutWindowRef.current.closed) {
      popoutWindowRef.current.postMessage({ type: "popout-stream-ended" }, "*");
      popoutWindowRef.current = null;
    }
  }, [isRemoteScreenSharing, isScreenSharing]);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (popoutWindowRef.current && !popoutWindowRef.current.closed) {
        popoutWindowRef.current.close();
      }
      delete window.__popoutStream;
    };
  }, []);

  /**
   * Pop out into a separate browser window.
   * For the sharer: pops out their own screen stream.
   * For the viewer: pops out the remote stream.
   */
  const popOutScreenShare = useCallback(() => {
    if (popoutWindowRef.current && !popoutWindowRef.current.closed) {
      popoutWindowRef.current.focus();
      return;
    }

    // Set the appropriate stream — sharer uses screenStream, viewer uses remoteStream
    window.__popoutStream = isScreenSharing ? screenStream : remoteStream;

    const popup = window.open(
      "/popout",
      "screen-share-popout",
      "width=1280,height=720,menubar=no,toolbar=no,location=no,status=no"
    );

    if (!popup) return;
    popoutWindowRef.current = popup;

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        popoutWindowRef.current = null;
        clearInterval(checkClosed);
      }
    }, 500);
  }, [remoteStream, screenStream, isScreenSharing]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }, []);

  const showScreenShareControls = isRemoteScreenSharing || isScreenSharing;

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gray-950 rounded-2xl overflow-hidden">
      {/* Remote video — ALWAYS mounted for audio continuity */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className={`w-full h-full ${
          isRemoteScreenSharing || isFullscreen ? "object-contain bg-black" : "object-cover"
        } ${remoteStream && isRemoteVideoEnabled ? "" : "hidden"}`}
      />

      {/* Placeholder overlay — shown when remote video is not active */}
      {!(remoteStream && isRemoteVideoEnabled) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
          {remoteStream ? (
            <>
              <VideoOff className="w-16 h-16 sm:w-20 sm:h-20 mb-4 opacity-30" />
              <p className="text-base sm:text-lg font-medium">Camera is turned off</p>
            </>
          ) : (
            <>
              <UserRound className="w-16 h-16 sm:w-20 sm:h-20 mb-4 opacity-30" />
              <p className="text-base sm:text-lg font-medium">
                {connectionState === "connecting"
                  ? "Connecting to peer..."
                  : connectionState === "connected"
                    ? "Waiting for remote video..."
                    : "Waiting for someone to join..."}
              </p>
              <p className="text-xs sm:text-sm text-gray-600 mt-2">
                Share the meeting code with another person
              </p>
            </>
          )}
        </div>
      )}

      {/* Top bar — presenting label + video controls */}
      {(remoteStream && isRemoteVideoEnabled) && (
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
          {/* Presenting label — only during screen share */}
          {showScreenShareControls ? (
            <div className="flex items-center gap-1.5 bg-blue-600/80 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-lg">
              <MonitorUp className="w-3.5 h-3.5" />
              {isScreenSharing ? "You are presenting" : "Presenting"}
            </div>
          ) : (
            <div />
          )}

          {/* Pop-out and enlarge — always available when there's remote video */}
          <div className="flex items-center gap-2 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              onClick={popOutScreenShare}
              className="flex items-center gap-1.5 bg-gray-800/80 hover:bg-gray-700/80 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              title="Pop out to separate window"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Pop out</span>
            </button>
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
      )}

      {/* Local PiP — shows screen preview when sharing, camera otherwise */}
      {localStream && (
        <div className="absolute bottom-3 right-3 w-28 h-20 sm:w-48 sm:h-36 rounded-lg sm:rounded-xl overflow-hidden border-2 border-gray-700 shadow-2xl bg-gray-900">
          {isScreenSharing && screenStream ? (
            // Sharer sees a preview of what they're sharing
            <video
              ref={screenPreviewRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain bg-black"
            />
          ) : isVideoEnabled ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-900">
              <VideoOff className="w-6 h-6 sm:w-8 sm:h-8 text-gray-600" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
