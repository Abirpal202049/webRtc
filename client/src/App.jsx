import { Routes, Route, Navigate } from "react-router-dom";
import HomePage from "./pages/HomePage.jsx";
import MeetingPage from "./pages/MeetingPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/meet/:meetingCode" element={<MeetingPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
