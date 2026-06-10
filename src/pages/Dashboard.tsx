import { useEffect, useState } from 'react';
import { ref, onValue, push, set, update } from 'firebase/database';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { LogOut, Package, Search, Camera, Loader2, X, ShieldCheck, CheckCircle2, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { auth, rtdb } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';

const ADMIN_EMAILS = ['inhak@gvcs-mg.org', 'hyeonung@gvcs-mg.org', 'mg224080441@gvcs-mg.org'];

export default function Dashboard() {
  const { user, role, userName, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [myRentals, setMyRentals] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('전체');

  const [rentalModal, setRentalModal] = useState<{isOpen: boolean, item: any}>({ isOpen: false, item: null });
  const [rentalDates, setRentalDates] = useState({ start: '', end: '' });
  
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

  const getKSTDate = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().split('T')[0];
  };
  const todayStr = getKSTDate();

  useEffect(() => {
    if (!user) { navigate('/'); return; }
    
    onValue(ref(rtdb, 'items'), (snap) => {
      const data = snap.val();
      setItems(data ? Object.entries(data).map(([id, val]: any) => ({ id, ...val })) : []);
    });

    onValue(ref(rtdb, 'rentals'), (snap) => {
      const data = snap.val();
      if (data) {
        const list = Object.entries(data)
          .map(([id, val]: any) => ({ id, ...val }))
          .filter(r => r.userId === user.uid && r.status !== 'returned');
        setMyRentals(list);
      } else { setMyRentals([]); }
    });
  }, [user, navigate]);

  const categories = ['전체', ...Array.from(new Set(items.map(item => item.category)))];

  const filteredItems = items.filter(item => {
    const lowerSearch = searchTerm.toLowerCase();
    const matchesSearch = item.name.toLowerCase().includes(lowerSearch) || (item.spec && item.spec.toLowerCase().includes(lowerSearch));
    return matchesSearch && (selectedCategory === '전체' || item.category === selectedCategory);
  });

  const handleRentalRequest = async () => {
    const { start, end } = rentalDates;
    const item = rentalModal.item;
    if (!start || !end) return showToast('날짜를 모두 선택해주세요.', 'error');
    if (start < todayStr) return showToast('과거 날짜는 선택할 수 없습니다.', 'error');
    if (start > end) return showToast('반납일이 대여일보다 빠릅니다.', 'error');
    if (item.availableQuantity <= 0) return showToast('재고가 없습니다.', 'error');
    if (item.isUnderRepair) return showToast('현재 수리 중인 기기입니다.', 'error');

    try {
      await set(push(ref(rtdb, 'rentals')), {
        itemId: item.id, itemName: item.name, userId: user?.uid, userName, userEmail: user?.email,
        startDate: start, endDate: end, rentalRequestedAt: new Date().toISOString(), status: 'rental_pending'
      });
      showToast('대여 신청이 완료되었습니다.', 'success');
      setRentalModal({ isOpen: false, item: null });
      setRentalDates({ start: '', end: '' });
    } catch (e) { showToast('신청 중 오류가 발생했습니다.', 'error'); }
  };

  const handleReturnImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingReturn(true);
    const formData = new FormData();
    formData.append('file', file);
    // 🔥 [Dashboard.tsx에도 하드코딩 적용 완료] 사용자가 반납할 때 에러가 나지 않도록 조치했습니다.
    formData.append('upload_preset', 'wl1frp3l');

    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/dfl2cn6o6/image/upload`, { 
        method: 'POST', 
        body: formData 
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error?.message || '업로드 실패');
      
      setReturnPhotoUrl(data.secure_url);
      showToast('사진이 업로드되었습니다.', 'success');
    } catch (error: any) { 
      showToast(`업로드 에러: ${error.message}`, 'error');
    } finally { 
      setIsUploadingReturn(false); 
    }
  };

  const submitReturnRequest = async () => {
    if (!returnModal.rental) return;
    if (!returnPhotoUrl) return showToast('기기 상태 사진을 첨부해주세요.', 'error');

    try {
      await update(ref(rtdb, `rentals/${returnModal.rental.id}`), {
        status: 'return_pending', returnRequestedAt: new Date().toISOString(),
        returnNote, returnPhotoUrl
      });
      showToast('반납 신청이 접수되었습니다.', 'success');
      setReturnModal({ isOpen: false, rental: null });
      setReturnNote(''); setReturnPhotoUrl('');
    } catch (e) { showToast('오류가 발생했습니다.', 'error'); }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-gray-900 font-sans pb-32">
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-40 shadow-sm px-8 h-20 flex items-center justify-between">
        <div className="flex items-center space-x-3 max-w-7xl mx-auto w-full">
          <div className="flex items-center space-x-3 flex-1">
            <div className="bg-black text-white p-2 rounded-xl shadow-md"><Package size={20}/></div>
            <h1 className="text-2xl font-black tracking-tight text-gray-900">S212 RENTAL</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="hidden sm:block text-sm font-bold text-gray-700 bg-gray-100 px-4 py-2 rounded-full">
              {userName} 님 환영합니다
            </div>
            <button onClick={() => { signOut(auth); setUser(null, null, ''); navigate('/'); }} className="p-2.5 text-gray-500 hover:text-red-500 rounded-full hover:bg-red-50 transition-colors">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 mt-10">
        
        {myRentals.length > 0 && (
          <section className="mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-black mb-5 text-black">나의 대여 현황</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {myRentals.map(r => (
                <div key={r.id} className="p-6 rounded-3xl bg-white border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-lg text-gray-900 line-clamp-1">{r.itemName}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-black tracking-wide ${
                        r.status === 'rental_pending' ? 'bg-amber-100 text-amber-700' :
                        r.status === 'return_pending' ? 'bg-blue-100 text-blue-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {r.status === 'rental_pending' ? '승인 대기중' : r.status === 'rented' ? '사용 중' : '반납 확인 대기'}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-500">{r.startDate} ~ {r.endDate}</p>
                  </div>
                  {r.status === 'rented' && (
                    <button onClick={() => setReturnModal({isOpen: true, rental: r})} className="mt-5 w-full py-3 bg-black text-white rounded-xl text-sm font-bold shadow-lg shadow-black/20 hover:bg-gray-800 transition active:scale-95">
                      반납하기
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mb-10 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
          <div className="relative group max-w-2xl">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={22} />
            <input 
              type="text" 
              placeholder="필요한 장비를 검색해보세요..." 
              className="w-full pl-14 pr-5 py-4 rounded-2xl bg-white border border-gray-200 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-base font-medium outline-none transition-all" 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide">
            {categories.map(cat => (
              <button 
                key={cat} 
                onClick={() => setSelectedCategory(cat)} 
                className={`px-6 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-black text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-900'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
          {filteredItems.map((item) => {
            const isUnavailable = item.isUnderRepair || item.availableQuantity <= 0;

            return (
              <div 
                key={item.id} 
                onClick={() => {
                  if (!isUnavailable) setRentalModal({isOpen: true, item: item});
                }} 
                className={`group bg-white rounded-[1.5rem] border border-gray-100 overflow-hidden transition-all duration-300 ${isUnavailable ? 'opacity-70 grayscale-[20%]' : 'cursor-pointer hover:shadow-xl hover:border-gray-300 hover:-translate-y-1 active:scale-[0.98]'}`}
              >
                <div className="aspect-video bg-gray-50 relative overflow-hidden">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={item.name} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300"><Package size={48}/></div>
                  )}
                  <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-black text-gray-800 shadow-sm">
                    {item.category}
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-gray-900 text-lg truncate pr-3">{item.name}</h3>
                    
                    {item.isUnderRepair ? (
                      <span className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-black bg-red-100 text-red-600">수리 중</span>
                    ) : (
                      <span className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-black ${item.availableQuantity > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {item.availableQuantity > 0 ? `잔여 ${item.availableQuantity}` : '재고 없음'}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-500 line-clamp-2 leading-relaxed">{item.spec || '상세 스펙 없음'}</p>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {isActualAdmin && (
        <button
          onClick={() => navigate('/admin')}
          className="fixed bottom-8 right-8 bg-black text-white px-6 py-4 rounded-full shadow-2xl hover:shadow-black/30 hover:-translate-y-1 transition-all flex items-center gap-3 z-50 font-bold group"
        >
          <ShieldCheck size={20} className="group-hover:scale-110 transition-transform duration-300" />
          관리자 화면으로 이동
        </button>
      )}

      {rentalModal.isOpen && rentalModal.item && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-gray-900">대여 신청</h2>
                <button onClick={() => setRentalModal({isOpen: false, item: null})} className="p-2.5 bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200 hover:text-gray-900 transition-colors"><X size={20} /></button>
              </div>
              <div className="mb-8 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="text-sm font-bold text-blue-600 mb-1">{rentalModal.item.category}</p>
                <h3 className="font-bold text-lg text-gray-900">{rentalModal.item.name}</h3>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-black text-gray-800 mb-2.5">대여 시작일</label>
                  <input type="date" min={todayStr} value={rentalDates.start} onChange={e => setRentalDates({...rentalDates, start: e.target.value})} className="w-full px-4 py-3.5 rounded-xl bg-white border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-medium text-gray-700" />
                </div>
                <div>
                  <label className="block text-sm font-black text-gray-800 mb-2.5">반납 예정일</label>
                  <input type="date" min={rentalDates.start || todayStr} value={rentalDates.end} onChange={e => setRentalDates({...rentalDates, end: e.target.value})} className="w-full px-4 py-3.5 rounded-xl bg-white border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-medium text-gray-700" />
                </div>
              </div>
              <button onClick={handleRentalRequest} className="w-full mt-8 bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition active:scale-95 text-base">
                신청 완료하기
              </button>
            </div>
          </div>
        </div>
      )}

      {returnModal.isOpen && returnModal.rental && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-black text-gray-900">장비 반납하기</h2>
                <button onClick={() => setReturnModal({isOpen: false, rental: null})} className="p-2.5 bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200 hover:text-gray-900 transition-colors"><X size={20} /></button>
              </div>
              <p className="text-sm font-medium text-gray-500 mb-8 leading-relaxed">
                현재 <span className="font-bold text-black bg-gray-100 px-1.5 py-0.5 rounded">{returnModal.rental.itemName}</span>의 상태를 확인할 수 있는 사진을 꼭 첨부해주세요.
              </p>
              
              <div className="space-y-6">
                
                {/* 🔥 카메라 / 앨범 분리 로직 적용된 반납 사진 업로드 부분 */}
                <div>
                  <label className="block text-sm font-black text-gray-800 mb-2.5">기기 사진 첨부 <span className="text-red-500">*</span></label>
                  <div className="flex w-full h-48 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50/50 overflow-hidden relative items-center justify-center">
                    {isUploadingReturn ? (
                      <div className="flex flex-col items-center z-10">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
                        <span className="text-sm font-bold text-gray-600">업로드 중...</span>
                      </div>
                    ) : returnPhotoUrl ? (
                      <>
                        <img src={returnPhotoUrl} className="w-full h-full object-cover absolute inset-0 z-0" />
                        <label className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex flex-col items-center justify-center backdrop-blur-sm cursor-pointer z-10">
                          <span className="text-white font-bold text-sm bg-black/40 px-4 py-2 rounded-xl">사진 변경하기</span>
                          <input type="file" className="hidden" accept="image/*" onChange={handleReturnImageUpload} />
                        </label>
                      </>
                    ) : (
                      <div className="flex gap-4 z-10">
                        <label className="flex flex-col items-center justify-center w-28 h-28 bg-white rounded-2xl shadow-sm border border-gray-200 cursor-pointer hover:bg-gray-50 transition-all active:scale-95">
                          <Camera size={32} className="mb-3 text-blue-600" />
                          <span className="text-sm font-bold text-gray-700">바로 촬영</span>
                          <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleReturnImageUpload} />
                        </label>
                        <label className="flex flex-col items-center justify-center w-28 h-28 bg-white rounded-2xl shadow-sm border border-gray-200 cursor-pointer hover:bg-gray-50 transition-all active:scale-95">
                          <ImageIcon size={32} className="mb-3 text-blue-600" />
                          <span className="text-sm font-bold text-gray-700">앨범 선택</span>
                          <input type="file" className="hidden" accept="image/*" onChange={handleReturnImageUpload} />
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-black text-gray-800 mb-2.5">특이사항 <span className="text-gray-400 font-medium">(선택)</span></label>
                  <textarea value={returnNote} onChange={e => setReturnNote(e.target.value)} placeholder="고장이나 파손 부위가 있다면 적어주세요." className="w-full p-4 rounded-xl bg-white border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 h-28 resize-none outline-none transition-all font-medium text-gray-700" />
                </div>
              </div>
              <button onClick={submitReturnRequest} disabled={isUploadingReturn} className="w-full mt-8 bg-black text-white py-4 rounded-xl font-bold shadow-lg shadow-black/20 hover:bg-gray-800 transition disabled:opacity-50 active:scale-95 text-base">
                반납 접수하기
              </button>
            </div>
          </div>
        </div>
      )}

      {toast.visible && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[110] animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="bg-gray-900 text-white px-6 py-4 rounded-full shadow-2xl flex items-center space-x-3">
            {toast.type === 'success' ? <CheckCircle2 size={20} className="text-green-400" /> : <AlertCircle size={20} className="text-red-400" />}
            <span className="text-sm font-bold tracking-wide">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}