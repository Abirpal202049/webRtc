import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Copy, Check, ChevronUp, ChevronDown, PanelRightClose, PanelRightOpen } from "lucide-react";
import { isValidMeetingCode } from "../utils/meetingCode";
import { useMediasoup } from "../hooks/useMediasoup";
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
import SfuTopology from "../components/SfuTopology";
import BandwidthGraph from "../components/BandwidthGraph";
import ConnectionTimeline from "../components/ConnectionTimeline";
import IceCandidateExplorer from "../components/IceCandidateExplorer";
import SdpInspector from "../components/SdpInspector";
import SimulcastSwitcher from "../components/SimulcastSwitcher";
import { useDeviceInfo } from "../hooks/useDeviceInfo";
import { useWebRTCStats } from "../hooks/useWebRTCStats";
import { usePeerStats } from "../hooks/usePeerStats";
import { useIceStats } from "../hooks/useIceStats";

export default function MeetingPage() {
  const { meetingCode } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const role = searchParams.get("role") === "creator" ? "creator" : "joiner";
  const maxParticipants = parseInt(searchParams.get("max")) || 10;

  const preview = useMediaPreview();
  const meeting = useMediasoup();
  const { stats: webrtcStats, history: webrtcHistory } = useWebRTCStats(
    meeting.sendTransportRef,
    meeting.recvTransportRef
  );
  const deviceInfo = useDeviceInfo(meeting.localStreamRef);
  const { peerStats, outboundStats } = usePeerStats(
    meeting.participants,
    meeting.audioProducerRef,
    meeting.videoProducerRef,
    meeting.sendTransportRef
  );
  const iceData = useIceStats(meeting.sendTransportRef);

  const [copied, setCopied] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugPanelOpen, setDebugPanelOpen] = useState(true);
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
      hasStartedRef.current = true;
      meeting.startCall({ roomId: meetingCode, role: "creator", maxParticipants });
    } else {
      hasStartedRef.current = true;
      preview.startPreview();
    }
  }, [role, meetingCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAskToJoin = () => {
    const stream = preview.getStream();
    meeting.startCall({ roomId: meetingCode, role: "joiner", existingStream: stream });
  };

  const copyMeetingCode = () => {
    navigator.clipboard.writeText(meetingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Show lobby if not yet in call
  const isWaitingForAdmission =
    meeting.admissionStatus === "waiting" ||
    meeting.admissionStatus === "denied" ||
    meeting.admissionStatus === "room-not-found";

  if ((role === "joiner" && !meeting.inCall) || isWaitingForAdmission) {
    return (
      <LobbyView
        meetingCode={meetingCode}
        previewStream={preview.previewStream || meeting.localStream}
        admissionStatus={meeting.admissionStatus}
        isAudioEnabled={preview.isAudioEnabled}
        isVideoEnabled={preview.isVideoEnabled}
        toggleAudio={preview.toggleAudio}
        toggleVideo={preview.toggleVideo}
        onAskToJoin={handleAskToJoin}
        onGoHome={() => {
          preview.stopPreview();
          meeting.hangUp();
          navigate("/");
        }}
      />
    );
  }

  const participantCount = meeting.participants.size + 1; // +1 for self

  // ── In-call UI ──
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
          <button
            onClick={() => setDebugPanelOpen(!debugPanelOpen)}
            className="hidden lg:flex items-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] sm:text-xs px-2 py-1 sm:py-1.5 rounded-lg transition-colors"
            title={debugPanelOpen ? "Collapse debug panel" : "Expand debug panel"}
          >
            {debugPanelOpen ? (
              <PanelRightClose className="w-3.5 h-3.5" />
            ) : (
              <PanelRightOpen className="w-3.5 h-3.5" />
            )}
            <span className="hidden xl:inline">{debugPanelOpen ? "Hide" : "Debug"}</span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row gap-2 sm:gap-4 p-2 sm:p-4 min-h-0 relative">
        {/* Join request notifications (creator only) */}
        <JoinRequestNotification
          requests={meeting.pendingJoinRequests}
          onAdmit={meeting.admitJoiner}
          onDeny={meeting.denyJoiner}
        />

        {/* Video area */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0">
            <VideoPanel
              localStream={meeting.localStream}
              participants={meeting.participants}
              isVideoEnabled={meeting.isVideoEnabled}
              isAudioEnabled={meeting.isAudioEnabled}
              isScreenSharing={meeting.isScreenSharing}
              screenStream={meeting.screenStream}
            />
          </div>
          <ControlBar
            toggleAudio={meeting.toggleAudio}
            toggleVideo={meeting.toggleVideo}
            toggleScreenShare={meeting.toggleScreenShare}
            hangUp={() => {
              meeting.hangUp();
              navigate("/");
            }}
            isAudioEnabled={meeting.isAudioEnabled}
            isVideoEnabled={meeting.isVideoEnabled}
            isScreenSharing={meeting.isScreenSharing}
            participantCount={participantCount}
          />
        </div>

        {/* Debug panel — collapsible on desktop */}
        <div
          className={`${
            showDebug ? "block" : "hidden"
          } ${
            debugPanelOpen ? "lg:block" : "lg:hidden"
          } lg:w-96 overflow-y-auto max-h-[40vh] lg:max-h-full min-h-0 shrink-0 space-y-2 sm:space-y-4`}
        >
          <SfuTopology
            participantCount={participantCount}
            connectionState={meeting.connectionState}
            peerStats={peerStats}
            outboundStats={outboundStats}
          />
          <ConnectionTimeline eventLog={meeting.eventLog} />
          <BandwidthGraph history={webrtcHistory} stats={webrtcStats} />
          <SimulcastSwitcher
            participants={meeting.participants}
            peerStats={peerStats}
            sendTransportRef={meeting.sendTransportRef}
            signalingClientRef={meeting.signalingClientRef}
          />
          <StateIndicator
            connectionState={meeting.connectionState}
            iceGatheringState="N/A (SFU)"
            signalingState="N/A (SFU)"
            iceCandidates={[]}
          />
          <PacketVisualizer stats={webrtcStats} participantCount={participantCount} />
          <MetricsDashboard stats={webrtcStats} history={webrtcHistory} participantCount={participantCount} />
          <IceCandidateExplorer iceData={iceData} />
          <SdpInspector
            sendTransportRef={meeting.sendTransportRef}
            recvTransportRef={meeting.recvTransportRef}
          />
          <DeviceNetworkPanel deviceInfo={deviceInfo} />
          <ConnectionLog eventLog={meeting.eventLog} />
        </div>
      </div>
    </div>
  );
}
