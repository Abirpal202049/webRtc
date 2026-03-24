import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Video, Plus, ArrowRight } from "lucide-react";
import { generateMeetingCode, formatMeetingCode, isValidMeetingCode } from "../utils/meetingCode";

export default function HomePage() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");

  const handleNewMeeting = () => {
    const code = generateMeetingCode();
    navigate(`/meet/${code}?role=creator`);
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (isValidMeetingCode(joinCode)) {
      navigate(`/meet/${joinCode}`);
    }
  };

  const handleCodeInput = (e) => {
    setJoinCode(formatMeetingCode(e.target.value));
  };

  return (
    <div className="min-h-dvh bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <Video className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">WebRTC Meet</h1>
          <p className="text-gray-400">
            Peer-to-peer video calls — no media server involved
          </p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 space-y-6">
          {/* New Meeting */}
          <button
            onClick={handleNewMeeting}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            New Meeting
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-gray-700" />
            <span className="text-xs text-gray-500">or join an existing one</span>
            <div className="flex-1 border-t border-gray-700" />
          </div>

          {/* Join with code */}
          <form onSubmit={handleJoin} className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={handleCodeInput}
              placeholder="abc-def-ghij"
              maxLength={12}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 font-mono text-center tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={!isValidMeetingCode(joinCode)}
              className="px-4 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg transition-colors"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>

          {/* Info */}
          <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
            <p className="text-xs text-gray-400 leading-relaxed">
              <span className="text-blue-400 font-medium">How it works: </span>
              Click "New Meeting" to create a room and get a shareable code.
              The other person enters your code to request to join. You accept,
              and a direct peer-to-peer connection is established.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
