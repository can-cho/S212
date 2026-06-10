// src/App.tsx 수정
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin'; // 1. 관리자 페이지 임포트

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin" element={<Admin />} /> {/* 2. 경로 추가 */}
      </Routes>
    </Router>
  );
}