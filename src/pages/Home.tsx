import { useNavigate } from 'react-router-dom';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { ref, get, set, update } from 'firebase/database';
import { auth, rtdb } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import { Package } from 'lucide-react';

// 🔥 [핵심 1] JSON 파일을 직접 불러옵니다. 경로를 실제 파일 위치에 맞게 맞춰주세요.
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

      // 1. 관리자 3명 정확히 지정
      const ADMIN_EMAILS = ['inhak@gvcs-mg.org', 'hyeonung@gvcs-mg.org', 'mg224080441@gvcs-mg.org'];
      const isAdmin = ADMIN_EMAILS.includes(email);
      
      // 2. 선생님 판별 (학생은 mg로 시작, 선생님은 그 외)
      const isTeacher = email.endsWith('@gvcs-mg.org') && !email.startsWith('mg');

      let role = isAdmin ? 'admin' : 'user';
      let name = user.displayName || '이름 없음';
      let isAuthorized = isAdmin || isTeacher;

      // 🔥 [핵심 2] 자퇴생 완벽 차단: JSON 파일에 이메일이 존재하는지 100% 대조
      if (!isAuthorized && email.startsWith('mg')) {
        // studentsList가 정상적인 배열일 때만 find 실행 (에러 방지)
        if (Array.isArray(studentsList)) {
          const foundStudent: any = studentsList.find((s: any) => s.email === email);
          
          if (foundStudent) {
            isAuthorized = true;
            name = foundStudent.name || name; // JSON에 있는 정확한 이름 사용
          }
        }
      }

      // JSON에 없거나(자퇴생), 외부 계정이면 즉시 컷!
      if (!isAuthorized) {
        await signOut(auth);
        alert('접근 거부: 등록된 재학생 명단에 없는 계정(자퇴생)이거나 권한이 없습니다.');
        return;
      }

      // --- 정상 로그인 통과 시 DB 권한 처리 ---
      const userRef = ref(rtdb, `users/${user.uid}`);
      const userSnapshot = await get(userRef);
      
      if (!userSnapshot.exists()) {
        // 첫 로그인
        await set(userRef, { email, name, role, createdAt: new Date().toISOString() });
      } else {
        const userData = userSnapshot.val();
        
        // 🔥 [핵심 3] 관리자 권한 덮어쓰기 버그 해결
        // 과거에 user로 저장되었더라도, 관리자 명단에 있으면 DB를 강제로 admin으로 바꿈
        if (isAdmin && userData.role !== 'admin') {
          await update(userRef, { role: 'admin' });
          role = 'admin';
        } else if (!isAdmin) {
          role = userData.role; 
        }
      }

      setUser(user, role, name);
      navigate(role === 'admin' ? '/admin' : '/dashboard');

    } catch (error: any) {
      console.error("로그인 에러:", error);
      if (error.code !== 'auth/popup-closed-by-user') {
        alert('로그인 처리 중 오류가 발생했습니다.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfcfd] flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-neutral-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto flex justify-center items-center w-14 h-14 rounded-2xl bg-neutral-900 text-white shadow-lg mb-6">
          <Package size={28} />
        </div>
        <h2 className="text-3xl font-bold tracking-tight mb-2">S212 RENTAL</h2>
        <p className="text-sm text-gray-500 mb-10">장비 대여 관리를 위해 공식 계정으로 로그인해주세요.</p>
        
        <button 
          type="button"
          onClick={handleGoogleLogin}
          className="relative z-10 w-full sm:w-80 mx-auto flex justify-center items-center gap-3 py-3.5 px-4 border border-gray-200 rounded-xl shadow-sm text-sm font-semibold text-neutral-900 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-1 transition-all active:scale-95 cursor-pointer"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          GVCS 계정으로 접속하기
        </button>
      </div>
    </div>
  );
}