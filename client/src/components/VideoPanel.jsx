import { useEffect, useRef } from "react";
import { UserRound, VideoOff, MonitorUp } from "lucide-react";

/**
 * VideoPanel — Displays local and remote video streams.
 *
 * The remote <video> element is ALWAYS mounted in the DOM.
 * We overlay a placeholder on top when the remote camera is off.
 *
 * When the remote peer is screen sharing, the video switches to
 * object-contain (letterboxed) so the full screen content is visible
 * without cropping.
 */
export default function VideoPanel({
  localStream,
  remoteStream,
  connectionState,
  isRemoteVideoEnabled,
  isVideoEnabled,
  isScreenSharing,
  isRemoteScreenSharing,
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="relative w-full h-full bg-gray-950 rounded-2xl overflow-hidden">
      {/* Remote video — ALWAYS mounted for audio continuity */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className={`w-full h-full ${
          isRemoteScreenSharing ? "object-contain bg-black" : "object-cover"
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

      {/* Remote screen sharing indicator */}
      {isRemoteScreenSharing && remoteStream && isRemoteVideoEnabled && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-blue-600/80 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-lg">
          <MonitorUp className="w-3.5 h-3.5" />
          Presenting
        </div>
      )}

      {/* Local screen sharing banner */}
      {isScreenSharing && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-blue-600/90 backdrop-blur-sm text-white text-xs sm:text-sm font-medium px-4 py-2 rounded-lg">
          <MonitorUp className="w-4 h-4" />
          You are presenting
        </div>
      )}

      {/* Local video — small picture-in-picture overlay */}
      {localStream && (
        <div className="absolute bottom-3 right-3 w-28 h-20 sm:w-48 sm:h-36 rounded-lg sm:rounded-xl overflow-hidden border-2 border-gray-700 shadow-2xl bg-gray-900">
          {isVideoEnabled ? (
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
