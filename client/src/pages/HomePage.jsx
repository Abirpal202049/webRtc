import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Video, Plus, ArrowRight, Users } from "lucide-react";
import { generateMeetingCode, formatMeetingCode, isValidMeetingCode } from "../utils/meetingCode";

const PARTICIPANT_OPTIONS = [10, 20, 30, 40, 50];

export default function HomePage() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [maxParticipants, setMaxParticipants] = useState(10);

  const handleNewMeeting = () => {
    const code = generateMeetingCode();
    navigate(`/meet/${code}?role=creator&max=${maxParticipants}`);
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
            SFU-powered video calls — media routed through the server
          </p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 space-y-6">
          {/* New Meeting + Max Participants */}
          <div className="space-y-3">
            <button
              onClick={handleNewMeeting}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              New Meeting
            </button>

            {/* Max participants selector */}
            <div className="flex items-center justify-between bg-gray-800/50 rounded-lg px-4 py-2.5 border border-gray-700/50">
              <div className="flex items-center gap-2 text-gray-400">
                <Users className="w-4 h-4" />
                <span className="text-xs font-medium">Max participants</span>
              </div>
              <select
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(Number(e.target.value))}
                className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {PARTICIPANT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} people
                  </option>
                ))}
              </select>
            </div>
          </div>

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
              Click "New Meeting" to create a room. Your video is sent to the
              mediasoup SFU server, which forwards it to all other participants.
              Each person uploads once — the server handles distribution to everyone else.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
