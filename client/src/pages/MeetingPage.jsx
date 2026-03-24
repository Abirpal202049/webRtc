import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Copy, Check, ChevronUp, ChevronDown } from "lucide-react";
import { isValidMeetingCode } from "../utils/meetingCode";
import { useWebRTC } from "../hooks/useWebRTC";
import { useMediaPreview } from "../hooks/useMediaPreview";
import LobbyView from "../components/LobbyView";
import VideoPanel from "../components/VideoPanel";
import ControlBar from "../components/ControlBar";
import ConnectionLog from "../components/ConnectionLog";
import StateIndicator from "../components/StateIndicator";
import MetricsDashboard from "../components/MetricsDashboard";
import PacketVisualizer from "../components/PacketVisualizer";
import DeviceNetworkPanel from "../components/DeviceNetworkPanel";
import JoinRequestNotification from "../components/JoinRequestNotification";
import { useDeviceInfo } from "../hooks/useDeviceInfo";
import { useWebRTCStats } from "../hooks/useWebRTCStats";

export default function MeetingPage() {
  const { meetingCode } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const role = searchParams.get("role") === "creator" ? "creator" : "joiner";

  const preview = useMediaPreview();
  const webrtc = useWebRTC();
  const { stats: webrtcStats, history: webrtcHistory } = useWebRTCStats(webrtc.peerConnectionRef);
  const deviceInfo = useDeviceInfo(webrtc.localStreamRef);

  const [copied, setCopied] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const hasStartedRef = useRef(false);

  // Validate meeting code
  useEffect(() => {
    if (!isValidMeetingCode(meetingCode)) {
      navigate("/", { replace: true });
    }
  }, [meetingCode, navigate]);

  // Auto-start based on role
  useEffect(() => {
    if (hasStartedRef.current || !isValidMeetingCode(meetingCode)) return;

    if (role === "creator") {
      // Creator: acquire media and create the room immediately
      hasStartedRef.current = true;
      webrtc.startCall({ roomId: meetingCode, role: "creator" });
    } else {
      // Joiner: start camera preview for the lobby
      hasStartedRef.current = true;
      preview.startPreview();
    }
  }, [role, meetingCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAskToJoin = () => {
    // Hand off the preview stream to WebRTC and start the join flow
    const stream = preview.getStream();
    webrtc.startCall({ roomId: meetingCode, role: "joiner", existingStream: stream });
  };

  const copyMeetingCode = () => {
    navigator.clipboard.writeText(meetingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Show lobby if not yet in call ──
  // This covers: explicit joiners, AND creators who got redirected to joiner
  // mode because the room already existed (onRoomExists → sendJoinRequest).
  const isWaitingForAdmission =
    webrtc.admissionStatus === "waiting" ||
    webrtc.admissionStatus === "denied" ||
    webrtc.admissionStatus === "room-not-found";

  if ((role === "joiner" && !webrtc.inCall) || isWaitingForAdmission) {
    return (
      <LobbyView
        meetingCode={meetingCode}
        previewStream={preview.previewStream || webrtc.localStream}
        admissionStatus={webrtc.admissionStatus}
        isAudioEnabled={preview.isAudioEnabled}
        isVideoEnabled={preview.isVideoEnabled}
        toggleAudio={preview.toggleAudio}
        toggleVideo={preview.toggleVideo}
        onAskToJoin={handleAskToJoin}
        onGoHome={() => {
          preview.stopPreview();
          webrtc.hangUp();
          navigate("/");
        }}
      />
    );
  }

  // ── In-call UI (creator immediately, joiner after admission) ──
  return (
    <div className="h-dvh bg-gray-950 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-gray-800 shrink-0">
        <h1 className="text-xs sm:text-sm font-semibold text-white">WebRTC Meet</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={copyMeetingCode}
            className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] sm:text-xs font-mono px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg transition-colors"
          >
            {meetingCode}
            {copied ? (
              <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-green-400" />
            ) : (
              <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            )}
          </button>
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="lg:hidden flex items-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] sm:text-xs px-2 py-1 sm:py-1.5 rounded-lg transition-colors"
          >
            Debug
            {showDebug ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row gap-2 sm:gap-4 p-2 sm:p-4 min-h-0 relative">
        {/* Join request notifications (creator only) */}
        <JoinRequestNotification
          requests={webrtc.pendingJoinRequests}
          onAdmit={webrtc.admitJoiner}
          onDeny={webrtc.denyJoiner}
        />

        {/* Video area */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0">
            <VideoPanel
              localStream={webrtc.localStream}
              remoteStream={webrtc.remoteStream}
              connectionState={webrtc.connectionState}
              isRemoteVideoEnabled={webrtc.isRemoteVideoEnabled}
              isVideoEnabled={webrtc.isVideoEnabled}
              isScreenSharing={webrtc.isScreenSharing}
              isRemoteScreenSharing={webrtc.isRemoteScreenSharing}
              screenStream={webrtc.screenStream}
            />
          </div>
          <ControlBar
            toggleAudio={webrtc.toggleAudio}
            toggleVideo={webrtc.toggleVideo}
            toggleScreenShare={webrtc.toggleScreenShare}
            hangUp={() => {
              webrtc.hangUp();
              navigate("/");
            }}
            isAudioEnabled={webrtc.isAudioEnabled}
            isVideoEnabled={webrtc.isVideoEnabled}
            isScreenSharing={webrtc.isScreenSharing}
          />
        </div>

        {/* Debug panel — entire right side scrolls as one */}
        <div
          className={`${
            showDebug ? "block" : "hidden"
          } lg:block lg:w-96 overflow-y-auto max-h-[40vh] lg:max-h-full min-h-0 shrink-0 space-y-2 sm:space-y-4`}
        >
          <StateIndicator
            connectionState={webrtc.connectionState}
            iceGatheringState={webrtc.iceGatheringState}
            signalingState={webrtc.signalingState}
            iceCandidates={webrtc.iceCandidates}
          />
          <PacketVisualizer stats={webrtcStats} />
          <MetricsDashboard stats={webrtcStats} history={webrtcHistory} />
          <DeviceNetworkPanel deviceInfo={deviceInfo} />
          <ConnectionLog eventLog={webrtc.eventLog} />
        </div>
      </div>
    </div>
  );
}
