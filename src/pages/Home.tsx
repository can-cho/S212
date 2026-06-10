import { useNavigate } from 'react-router-dom';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { ref, get, set, update } from 'firebase/database';
import { auth, rtdb } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import { Fingerprint } from 'lucide-react';

// 🔥 자퇴생 검증용 JSON 파일 로드
import studentsList from '../data/students.json';

export default function Home() {
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ hd: 'gvcs-mg.org' });

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const email = user.email || '';

      const ADMIN_EMAILS = ['inhak@gvcs-mg.org', 'hyeonung@gvcs-mg.org', 'mg224080441@gvcs-mg.org'];
      const isAdmin = ADMIN_EMAILS.includes(email);
      const isTeacher = email.endsWith('@gvcs-mg.org') && !email.startsWith('mg');

      let role = isAdmin ? 'admin' : 'user';
      let name = user.displayName || '이름 없음';
      let isAuthorized = isAdmin || isTeacher;

      if (!isAuthorized && email.startsWith('mg')) {
        if (Array.isArray(studentsList)) {
          const foundStudent: any = studentsList.find((s: any) => s.email === email);
          if (foundStudent) {
            isAuthorized = true;
            name = foundStudent.name || name; 
          }
        }
      }

      if (!isAuthorized) {
        await signOut(auth);
        alert('접근 거부: 등록된 재학생 명단에 없는 계정(자퇴생)이거나 권한이 없습니다.');
        return;
      }

      const userRef = ref(rtdb, `users/${user.uid}`);
      const userSnapshot = await get(userRef);
      
      if (!userSnapshot.exists()) {
        await set(userRef, { email, name, role, createdAt: new Date().toISOString() });
      } else {
        const userData = userSnapshot.val();
        if (isAdmin && userData.role !== 'admin') {
          await update(userRef, { role: 'admin' });
          role = 'admin';
        } else if (!isAdmin) {
          role = userData.role; 
        }
      }

      setUser(user, role, name);
      navigate('/dashboard'); 

    } catch (error: any) {
      if (error.code !== 'auth/popup-closed-by-user') {
        alert('로그인 처리 중 오류가 발생했습니다.');
      }
    }
  };

  return (
    <div className="relative min-h-screen bg-[#050505] flex flex-col items-center justify-center px-4 font-sans text-white overflow-hidden selection:bg-cyan-500/30">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-tr from-blue-600/20 to-cyan-400/20 rounded-full blur-[150px] animate-pulse pointer-events-none" />
      
      <div className="relative z-10 w-full max-w-sm flex flex-col items-center animate-in fade-in zoom-in-95 duration-1000">
        <div className="w-20 h-20 mb-8 rounded-full border border-white/10 bg-white/[0.02] flex items-center justify-center backdrop-blur-xl shadow-[0_0_50px_rgba(34,211,238,0.15)] relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-400/20 to-transparent -translate-y-full group-hover:animate-[scan_2s_ease-in-out_infinite]" />
          <Fingerprint size={36} className="text-cyan-400" />
        </div>

        <h1 className="text-5xl font-black tracking-tighter mb-3 text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
          S212 RENTAL
        </h1>
        <p className="text-sm font-medium text-gray-500 tracking-wide mb-12 text-center leading-relaxed">
          글로벌선진학교 장비 대여 시스템 <br />
          보안 검증을 위해 인증을 진행해 주세요.
        </p>

        <button 
          onClick={handleGoogleLogin}
          className="group relative w-full flex items-center justify-center gap-4 py-4 px-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl backdrop-blur-md transition-all duration-300 hover:shadow-[0_0_30px_rgba(255,255,255,0.05)] hover:border-white/30 active:scale-[0.98]"
        >
          <svg className="w-5 h-5 transition-transform group-hover:scale-110 duration-300" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <span className="font-bold text-white tracking-wide">GVCS 계정으로 계속하기</span>
        </button>
      </div>
    </div>
  );
}