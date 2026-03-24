import { useEffect, useRef } from "react";
import { UserRound, VideoOff } from "lucide-react";

/**
 * VideoPanel — Displays local and remote video streams.
 *
 * IMPORTANT WebRTC detail:
 * We set <video>.srcObject = stream (not .src).
 * MediaStreams are not URL-based — they are live, real-time data objects.
 * The browser knows how to render a MediaStream directly in a <video> element.
 *
 * The local video is mirrored (scaleX(-1)) so it feels like looking in a
 * mirror — this is what users expect from a selfie view.
 * The local video is also muted to prevent audio feedback (echoing your own mic).
 */
export default function VideoPanel({ localStream, remoteStream, connectionState, isRemoteVideoEnabled }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Attach the local MediaStream to the <video> element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Attach the remote MediaStream to the <video> element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const showRemoteVideo = remoteStream && isRemoteVideoEnabled;

  return (
    <div className="relative w-full h-full bg-gray-950 rounded-2xl overflow-hidden">
      {/* Remote video — fills the main area */}
      {showRemoteVideo ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
          {remoteStream ? (
            <>
              {/* Remote peer is connected but camera is off */}
              <VideoOff className="w-16 h-16 sm:w-20 sm:h-20 mb-4 opacity-30" />
              <p className="text-base sm:text-lg font-medium">Camera is turned off</p>
              {/* Keep the video element in the DOM so audio still plays */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="hidden"
              />
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
                Share the room ID with another person
              </p>
            </>
          )}
        </div>
      )}

      {/* Local video — small picture-in-picture overlay */}
      {localStream && (
        <div className="absolute bottom-3 right-3 w-28 h-20 sm:w-48 sm:h-36 rounded-lg sm:rounded-xl overflow-hidden border-2 border-gray-700 shadow-2xl bg-gray-900">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />
        </div>
      )}
    </div>
  );
}
