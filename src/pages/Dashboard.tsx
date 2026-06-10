import { useEffect, useState } from 'react';
import { ref, onValue, push, set, update } from 'firebase/database';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { 
  LogOut, Search, Camera, Loader2, X, ShieldCheck, 
  CheckCircle, AlertCircle, Image as ImageIcon, 
  LayoutGrid, Grid, List, Zap, Archive 
} from 'lucide-react';
import { auth, rtdb } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';

const ADMIN_EMAILS = ['inhak@gvcs-mg.org', 'hyeonung@gvcs-mg.org', 'mg224080441@gvcs-mg.org'];
const GREETINGS = ["환영합니다!", "안녕하세요!", "좋은 하루 보내세요!", "오늘도 빛나는 하루 되세요!", "어떤 장비가 필요하신가요?"];

export default function Dashboard() {
  const { user, role, userName, setUser } = useAuthStore();
  const navigate = useNavigate();
  
  const [items, setItems] = useState<any[]>([]);
  const [myRentals, setMyRentals] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('전체');
  
  const [viewMode, setViewMode] = useState<'large' | 'small' | 'text'>('large');
  const [greeting, setGreeting] = useState('');

  const [isMyRentalsOpen, setIsMyRentalsOpen] = useState(false); 
  
  const [rentalModal, setRentalModal] = useState<{isOpen: boolean, item: any}>({ isOpen: false, item: null });
  const [endDate, setEndDate] = useState('');
  
  const [returnModal, setReturnModal] = useState<{isOpen: boolean, rental: any}>({ isOpen: false, rental: null });
  const [returnNote, setReturnNote] = useState('');
  const [returnPhotoUrl, setReturnPhotoUrl] = useState('');
  const [isUploadingReturn, setIsUploadingReturn] = useState(false);
  
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({ visible: false, message: '', type: 'success' });

  const isActualAdmin = role === 'admin' || (user?.email && ADMIN_EMAILS.includes(user.email));

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
  };

  const todayStr = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];

  useEffect(() => {
    if (!user) { navigate('/'); return; }
    setGreeting(GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
    
    onValue(ref(rtdb, 'items'), (snap) => {
      const data = snap.val(); 
      setItems(data ? Object.entries(data).map(([id, val]: any) => ({ id, ...val })) : []);
    });
    
    onValue(ref(rtdb, 'rentals'), (snap) => {
      const data = snap.val();
      if (data) {
        // 거절 및 반납이 완전히 완료된 데이터를 제외한 유효 활성 데이터셋만 바인딩
        const activeStatuses = ['rental_pending', 'rented', 'extension_pending', 'return_pending'];
        setMyRentals(
          Object.entries(data)
            .map(([id, val]: any) => ({ id, ...val }))
            .filter(r => r.userId === user.uid && activeStatuses.includes(r.status))
        );
      } else { setMyRentals([]); }
    });
  }, [user, navigate]);

  const categories = ['전체', ...Array.from(new Set(items.map(item => item.category)))];
  
  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || (item.spec && item.spec.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch && (selectedCategory === '전체' || item.category === selectedCategory);
  });

  const handleRentalRequest = async () => {
    const item = rentalModal.item;
    
    if (!endDate) return showToast('반납 예정일을 선택해주세요.', 'error');
    if (endDate < todayStr) return showToast('과거 날짜는 선택할 수 없습니다.', 'error');
    if (item.availableQuantity <= 0) return showToast('현재 대여 가능한 재고가 없습니다.', 'error');
    if (item.isUnderRepair) return showToast('현재 수리 중인 기기입니다.', 'error');

    try {
      await set(push(ref(rtdb, 'rentals')), { 
        itemId: item.id, itemName: item.name, userId: user?.uid, userName, userEmail: user?.email, 
        startDate: todayStr, endDate: endDate, rentalRequestedAt: new Date().toISOString(), status: 'rental_pending' 
      });
      showToast('대여 신청이 완료되었습니다. 관리자 승인을 대기합니다.', 'success'); 
      setRentalModal({ isOpen: false, item: null }); setEndDate('');
    } catch (e) { showToast('신청 중 오류가 발생했습니다.', 'error'); }
  };

  const handleReturnImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setIsUploadingReturn(true);
    const formData = new FormData(); formData.append('file', file); formData.append('upload_preset', 'wl1frp3l');
    
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/dfl2cn6o6/image/upload`, { method: 'POST', body: formData });
      const data = await res.json(); 
      if (!res.ok) throw new Error(data.error?.message || '업로드 실패');
      setReturnPhotoUrl(data.secure_url); showToast('사진이 업로드되었습니다.', 'success');
    } catch (error: any) { showToast(`업로드 에러: ${error.message}`, 'error'); } 
    finally { setIsUploadingReturn(false); }
  };

  const submitReturnRequest = async () => {
    if (!returnModal.rental) return;
    if (!returnPhotoUrl) return showToast('기기 상태 사진을 첨부해주세요.', 'error');
    try {
      await update(ref(rtdb, `rentals/${returnModal.rental.id}`), { 
        status: 'return_pending', returnRequestedAt: new Date().toISOString(), returnNote, returnPhotoUrl 
      });
      showToast('반납 신청이 접수되었습니다.', 'success'); 
      setReturnModal({ isOpen: false, rental: null }); setReturnNote(''); setReturnPhotoUrl('');
    } catch (e) { showToast('오류가 발생했습니다.', 'error'); }
  };

  const handleExtensionRequest = async (rental: any) => {
    if (rental.hasExtended) {
      return alert('연장은 1회만 가능합니다.');
    }

    const currentEndDate = new Date(rental.endDate);
    currentEndDate.setDate(currentEndDate.getDate() + 7);
    const maxExtendableDate = currentEndDate.toISOString().split('T')[0];

    const extensionDate = window.prompt(`연장할 날짜를 입력하세요 (최대 ${maxExtendableDate}까지 가능):\n입력 예시: YYYY-MM-DD`);
    
    if (!extensionDate) return;
    if (extensionDate > maxExtendableDate || extensionDate <= rental.endDate) {
      return alert(`유효하지 않은 날짜입니다. 기존 반납일 이후부터 ${maxExtendableDate} 사이로 입력해주세요.`);
    }

    try {
      await update(ref(rtdb, `rentals/${rental.id}`), { 
        status: 'extension_pending', 
        requestedExtensionDate: extensionDate 
      });
      showToast('연장 신청이 완료되었습니다.', 'success');
    } catch (error) {
      showToast('오류가 발생했습니다.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-gray-200 font-sans pb-32 selection:bg-cyan-500/30">
      <header className="absolute top-0 w-full z-40 px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="text-cyan-400" size={24} />
          <h1 className="text-xl font-bold tracking-tighter text-white">S212</h1>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setIsMyRentalsOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm font-bold transition-all text-white backdrop-blur-md">
            <Archive size={16} className="text-cyan-400" />
            내 장비함
            {myRentals.length > 0 && <span className="bg-cyan-500 text-black px-1.5 py-0.5 rounded-full text-[10px] font-black">{myRentals.length}</span>}
          </button>
          <button onClick={() => { signOut(auth); setUser(null, null, ''); navigate('/'); }} className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 rounded-full transition-all text-gray-400 hover:text-red-400">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-32 sm:pt-40 flex flex-col items-center">
        <h2 className="text-4xl sm:text-5xl font-black tracking-tight mb-10 text-center animate-in fade-in slide-in-from-bottom-5 duration-700">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">{userName}</span>님, <br className="sm:hidden" />
          <span className="text-white/90">{greeting}</span>
        </h2>

        <div className="w-full max-w-2xl relative group mb-16 animate-in fade-in zoom-in-95 duration-700 delay-100">
          <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-3xl blur opacity-20 group-focus-within:opacity-40 transition duration-500"></div>
          <div className="relative flex items-center bg-[#0f1115] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <Search className="absolute left-6 text-gray-500 group-focus-within:text-cyan-400 transition-colors" size={24} />
            <input type="text" placeholder="무엇을 대여하시겠습니까?" className="w-full pl-16 pr-6 py-5 sm:py-6 bg-transparent border-none text-white text-lg sm:text-xl font-medium focus:ring-0 outline-none placeholder-gray-600" onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>

        <div className="w-full flex flex-col sm:flex-row justify-between items-center gap-4 mb-8 animate-in fade-in duration-500 delay-200">
          <div className="flex gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 scrollbar-hide">
            {categories.map(cat => (
              <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all border ${selectedCategory === cat ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : 'bg-transparent text-gray-500 border-white/5 hover:text-white hover:border-white/20'}`}>{cat}</button>
            ))}
          </div>

          <div className="flex bg-[#0f1115] p-1 rounded-xl border border-white/5">
            <button onClick={() => setViewMode('large')} className={`p-2 rounded-lg transition-all ${viewMode === 'large' ? 'bg-white/10 text-white' : 'text-gray-600 hover:text-gray-300'}`}><LayoutGrid size={18} /></button>
            <button onClick={() => setViewMode('small')} className={`p-2 rounded-lg transition-all ${viewMode === 'small' ? 'bg-white/10 text-white' : 'text-gray-600 hover:text-gray-300'}`}><Grid size={18} /></button>
            <button onClick={() => setViewMode('text')} className={`p-2 rounded-lg transition-all ${viewMode === 'text' ? 'bg-white/10 text-white' : 'text-gray-600 hover:text-gray-300'}`}><List size={18} /></button>
          </div>
        </div>

        <div className={`w-full grid gap-4 animate-in fade-in slide-in-from-bottom-5 duration-700 delay-300
          ${viewMode === 'large' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : ''}
          ${viewMode === 'small' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : ''}
          ${viewMode === 'text' ? 'flex flex-col' : ''}
        `}>
          {filteredItems.map((item) => {
            const isUnavailable = item.isUnderRepair || item.availableQuantity <= 0;

            if (viewMode === 'text') {
              return (
                <div key={item.id} onClick={() => { if (!isUnavailable) setRentalModal({isOpen: true, item}); }} className={`flex items-center justify-between p-5 bg-[#0f1115] border border-white/5 rounded-2xl transition-all ${isUnavailable ? 'opacity-40' : 'cursor-pointer hover:bg-white/5 hover:border-white/20 active:scale-[0.99]'}`}>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-medium text-cyan-500/50 w-16 truncate">{item.category}</span>
                    <span className="font-bold text-white text-base">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="hidden sm:block text-sm text-gray-500 truncate max-w-sm pr-4">{item.spec}</span>
                    {item.isUnderRepair ? <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-red-500/10 text-red-400">수리 중</span> : <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${item.availableQuantity > 0 ? 'bg-cyan-500/10 text-cyan-400' : 'bg-white/5 text-gray-600'}`}>잔여 {item.availableQuantity}</span>}
                  </div>
                </div>
              );
            }

            return (
              <div key={item.id} onClick={() => { if (!isUnavailable) setRentalModal({isOpen: true, item}); }} className={`group bg-[#0f1115] rounded-[24px] border border-white/5 overflow-hidden transition-all duration-300 ${isUnavailable ? 'opacity-40 grayscale' : 'cursor-pointer hover:border-white/20 hover:shadow-[0_10px_40px_rgba(0,0,0,0.5)] hover:-translate-y-1 active:scale-[0.98]'}`}>
                <div className={`relative bg-black/50 overflow-hidden ${viewMode === 'large' ? 'aspect-video' : 'aspect-square'}`}>
                  {item.imageUrl ? <img src={item.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-80 group-hover:opacity-100" /> : <div className="w-full h-full flex items-center justify-center text-gray-700"><Zap size={48} className="opacity-20"/></div>}
                  <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] font-medium text-white border border-white/10">{item.category}</div>
                </div>
                <div className={`p-5 ${viewMode === 'small' ? 'p-4' : ''}`}>
                  <h3 className={`font-bold text-white truncate mb-1 ${viewMode === 'small' ? 'text-sm' : 'text-lg'}`}>{item.name}</h3>
                  {viewMode === 'large' && <p className="text-sm text-gray-500 line-clamp-1 mb-4">{item.spec || '상세 스펙 없음'}</p>}
                  <div className="flex items-center mt-2">
                    {item.isUnderRepair ? <span className="text-[11px] font-bold text-red-400">수리 중 (대여 불가)</span> : <span className={`text-[11px] font-bold ${item.availableQuantity > 0 ? 'text-cyan-400' : 'text-gray-600'}`}>{item.availableQuantity > 0 ? `현재 ${item.availableQuantity}대 대여 가능` : '재고 없음'}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {isActualAdmin && (
        <button onClick={() => navigate('/admin')} className="fixed bottom-8 right-8 bg-white text-black px-6 py-3.5 rounded-full shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:scale-105 transition-all flex items-center gap-2 z-50 font-bold group">
          <ShieldCheck size={18} /> ADMIN
        </button>
      )}

      {/* 내 장비함 사이드 팝업 */}
      {isMyRentalsOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex justify-end">
          <div className="w-full max-w-md bg-[#0f1115] h-full border-l border-white/10 p-6 sm:p-8 animate-in slide-in-from-right duration-300 overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold text-white">내 장비함</h2>
              <button onClick={() => setIsMyRentalsOpen(false)} className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors"><X size={20} /></button>
            </div>
            {myRentals.length === 0 ? (
              <div className="text-center py-20 text-gray-500"><Archive size={48} className="mx-auto mb-4 opacity-20" /><p>대여 중이거나 신청한 장비가 없습니다.</p></div>
            ) : (
              <div className="space-y-4">
                {myRentals.map(r => (
                  <div key={r.id} className="p-5 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-4">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-lg text-white">{r.itemName}</h3>
                        <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                          r.status === 'rental_pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                          r.status === 'rented' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 
                          r.status === 'extension_pending' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'
                        }`}>
                          {/* 💡 요청에 맞춰 실시간 상태 텍스트 정밀화 변경 */}
                          {r.status === 'rental_pending' ? '관리자의 대여 승인을 기다리고 있습니다' : 
                           r.status === 'rented' ? '대여 중' : 
                           r.status === 'extension_pending' ? '연장 대기중' : '반납 대기중'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">반납 예정일: {r.endDate}</p>
                    </div>
                    {/* 💡 오직 관리자의 승인을 통과하여 'rented' (대여 중) 상태가 된 기기만 반납 및 연장이 가능합니다 */}
                    {r.status === 'rented' && (
                      <div className="flex gap-2">
                        <button onClick={() => { setIsMyRentalsOpen(false); setReturnModal({isOpen: true, rental: r}); }} className="flex-1 py-3 bg-white text-black rounded-xl text-sm font-bold hover:bg-gray-200 transition active:scale-95">반납 신청</button>
                        <button onClick={() => handleExtensionRequest(r)} className="flex-1 py-3 bg-white/10 text-white rounded-xl text-sm font-bold hover:bg-white/20 transition active:scale-95 border border-white/10">연장 (1회)</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 대여 신청 모달 */}
      {rentalModal.isOpen && rentalModal.item && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-[#0f1115] border border-white/10 rounded-[32px] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">대여 신청</h2>
              <button onClick={() => setRentalModal({isOpen: false, item: null})} className="text-gray-500 hover:text-white"><X size={24} /></button>
            </div>
            <div className="mb-8 pb-6 border-b border-white/5">
              <p className="text-sm text-cyan-400 mb-1">{rentalModal.item.category}</p>
              <h3 className="text-xl font-bold text-white">{rentalModal.item.name}</h3>
            </div>
            <div className="space-y-5 mb-8">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">반납 예정일</label>
                <input 
                  type="date" 
                  min={todayStr} 
                  value={endDate} 
                  onChange={e => setEndDate(e.target.value)} 
                  className="w-full px-5 py-4 rounded-xl bg-white/5 border border-white/10 text-white focus:border-cyan-500 outline-none transition-all text-base [color-scheme:dark]" 
                />
                <p className="text-[11px] text-gray-500 mt-2">* 대여는 오늘({todayStr}) 즉시 시작 신청됩니다.</p>
              </div>
            </div>
            <button onClick={handleRentalRequest} className="w-full bg-cyan-500 text-black py-4 rounded-xl font-bold hover:bg-cyan-400 transition-all active:scale-95 text-base">신청 완료</button>
          </div>
        </div>
      )}

      {/* 반납 모달 */}
      {returnModal.isOpen && returnModal.rental && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-[#0f1115] border border-white/10 rounded-[32px] w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">장비 반납</h2>
              <button onClick={() => setReturnModal({isOpen: false, rental: null})} className="text-gray-500 hover:text-white"><X size={24} /></button>
            </div>
            <p className="text-gray-400 mb-6 text-sm"><strong className="text-white font-medium">{returnModal.rental.itemName}</strong>의 현재 상태를 확인할 수 있는 사진을 첨부해 주세요.</p>
            
            <div className="space-y-6 mb-8">
              <div>
                <div className="flex w-full h-48 border border-dashed border-white/20 rounded-2xl bg-white/5 overflow-hidden relative items-center justify-center">
                  {isUploadingReturn ? (
                    <div className="flex flex-col items-center text-cyan-500"><Loader2 className="w-8 h-8 animate-spin mb-3" /><span className="text-sm font-bold">업로드 중...</span></div>
                  ) : returnPhotoUrl ? (
                    <><img src={returnPhotoUrl} className="w-full h-full object-cover absolute inset-0 z-0 opacity-80" /><label className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 flex flex-col items-center justify-center cursor-pointer z-10 transition-opacity"><span className="text-white font-bold text-sm bg-black/50 px-4 py-2 rounded-full backdrop-blur-md">다시 올리기</span><input type="file" className="hidden" accept="image/*" onChange={handleReturnImageUpload} /></label></>
                  ) : (
                    <div className="flex gap-4 z-10">
                      <label className="flex flex-col items-center justify-center w-28 h-28 bg-white/5 rounded-2xl border border-white/10 cursor-pointer hover:bg-white/10 transition-all active:scale-95"><Camera size={28} className="mb-3 text-cyan-400" /><span className="text-xs font-medium text-gray-300">카메라</span><input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleReturnImageUpload} /></label>
                      <label className="flex flex-col items-center justify-center w-28 h-28 bg-white/5 rounded-2xl border border-white/10 cursor-pointer hover:bg-white/10 transition-all active:scale-95"><ImageIcon size={28} className="mb-3 text-cyan-400" /><span className="text-xs font-medium text-gray-300">앨범 선택</span><input type="file" className="hidden" accept="image/*" onChange={handleReturnImageUpload} /></label>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <textarea value={returnNote} onChange={e => setReturnNote(e.target.value)} placeholder="파손/고장 등 특이사항이 있다면 적어주세요." className="w-full p-5 rounded-2xl bg-white/5 border border-transparent text-white focus:border-cyan-500 h-32 resize-none outline-none transition-all text-sm" />
              </div>
            </div>
            <button onClick={submitReturnRequest} disabled={isUploadingReturn} className="w-full bg-white text-black py-4 rounded-xl font-bold hover:bg-gray-200 transition-all disabled:opacity-50 active:scale-95 text-base">반납 접수 완료</button>
          </div>
        </div>
      )}

      {toast.visible && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[120] animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="bg-white text-black px-6 py-4 rounded-full shadow-2xl flex items-center space-x-3">
            {toast.type === 'success' ? <CheckCircle size={18} className="text-green-600" /> : <AlertCircle size={18} className="text-red-600" />}
            <span className="text-sm font-bold">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}