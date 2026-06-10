import { useEffect, useState } from 'react';
import { ref, onValue, push, set, update, remove } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Edit, Trash2, X, Image as ImageIcon, Loader2, Check, List, ClipboardList, Home, Camera } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore'; 

export default function Admin() {
  const navigate = useNavigate();
  const { user, role } = useAuthStore(); 
  
  const ADMIN_EMAILS = ['inhak@gvcs-mg.org', 'hyeonung@gvcs-mg.org', 'mg224080441@gvcs-mg.org'];

  const [activeTab, setActiveTab] = useState<'rentals' | 'inventory'>('inventory');

  const [items, setItems] = useState<any[]>([]);
  const [rentals, setRentals] = useState<any[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('전체');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    spec: '',
    totalQuantity: 1,
    availableQuantity: 1,
    imageUrl: ''
  });
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const isActualAdmin = role === 'admin' || (user?.email && ADMIN_EMAILS.includes(user.email));
    
    if (!user || !isActualAdmin) {
      alert('접근 권한이 없습니다. 등록된 관리자만 이용 가능합니다.');
      navigate('/');
      return;
    }

    onValue(ref(rtdb, 'items'), (snap) => {
      const data = snap.val();
      setItems(data ? Object.entries(data).map(([id, val]: any) => ({ id, ...val })) : []);
    });

    onValue(ref(rtdb, 'rentals'), (snap) => {
      const data = snap.val();
      setRentals(data ? Object.entries(data).map(([id, val]: any) => ({ id, ...val })).reverse() : []);
    });
  }, [user, role, navigate]); 

  const categories = ['전체', ...Array.from(new Set(items.map(item => item.category)))];

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (item.spec && item.spec.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === '전체' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const openAddModal = () => {
    setEditItemId(null);
    setFormData({ name: '', category: '', spec: '', totalQuantity: 1, availableQuantity: 1, imageUrl: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (item: any) => {
    setEditItemId(item.id);
    setFormData({
      name: item.name,
      category: item.category,
      spec: item.spec || '',
      totalQuantity: item.totalQuantity || item.availableQuantity,
      availableQuantity: item.availableQuantity,
      imageUrl: item.imageUrl || ''
    });
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const uploadData = new FormData();
    uploadData.append('file', file);
    uploadData.append('upload_preset', 'wl1frp3l'); 

    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/dfl2cn6o6/image/upload`, { 
        method: 'POST',
        body: uploadData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || '업로드 실패');
      
      setFormData(prev => ({ ...prev, imageUrl: data.secure_url }));
    } catch (error) {
      alert('이미지 업로드에 실패했습니다. 콘솔을 확인해주세요.');
      console.error(error);
    } finally {
      setIsUploading(false);
    }
  };

  const saveItem = async () => {
    if (!formData.name || !formData.category) return alert('기기명과 카테고리는 필수입니다.');

    try {
      if (editItemId) {
        await update(ref(rtdb, `items/${editItemId}`), formData);
        alert('장비가 성공적으로 수정되었습니다.');
      } else {
        await set(push(ref(rtdb, 'items')), { ...formData, isUnderRepair: false });
        alert('새 장비가 추가되었습니다.');
      }
      setIsModalOpen(false);
    } catch (e) {
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const deleteItem = async (id: string, name: string) => {
    if (window.confirm(`정말 '${name}' 기기를 삭제하시겠습니까?`)) {
      await remove(ref(rtdb, `items/${id}`));
      alert('삭제되었습니다.');
    }
  };

  const toggleRepairStatus = async (id: string, currentStatus: boolean, name: string) => {
    const action = currentStatus ? '정상(대여 가능)' : '수리 중(대여 불가)';
    if (window.confirm(`'${name}' 기기를 [${action}] 상태로 변경하시겠습니까?`)) {
      await update(ref(rtdb, `items/${id}`), { isUnderRepair: !currentStatus });
    }
  };

  const handleRentalStatus = async (rentalId: string, itemId: string, newStatus: string, currentAvailable: number) => {
    try {
      await update(ref(rtdb, `rentals/${rentalId}`), { status: newStatus });
      if (newStatus === 'rented') {
        await update(ref(rtdb, `items/${itemId}`), { availableQuantity: currentAvailable - 1 });
      }
      if (newStatus === 'returned' || newStatus === 'rejected') {
        const itemObj = items.find(i => i.id === itemId);
        if (itemObj) {
          await update(ref(rtdb, `items/${itemId}`), { availableQuantity: itemObj.availableQuantity + 1 });
        }
      }
    } catch (error) {
      alert('처리 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex flex-col font-sans text-gray-900 pb-32">
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-30 shadow-sm px-8 h-20 flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight text-gray-900">S212 <span className="text-blue-600">ADMIN</span></h1>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold bg-gray-100 px-3 py-1.5 rounded-full text-gray-600">관리자 모드</span>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-8 mt-10">
        <div className="flex space-x-2 mb-10 bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100 w-max">
          <button 
            onClick={() => setActiveTab('inventory')}
            className={`flex items-center px-6 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'inventory' ? 'bg-black text-white shadow-md' : 'bg-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
          >
            <List size={18} className="mr-2.5" /> 장비 목록 관리
          </button>
          <button 
            onClick={() => setActiveTab('rentals')}
            className={`flex items-center px-6 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'rentals' ? 'bg-black text-white shadow-md' : 'bg-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
          >
            <ClipboardList size={18} className="mr-2.5" /> 대여 요청 처리
            {rentals.filter(r => r.status.includes('pending')).length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-[11px] px-2.5 py-0.5 rounded-full font-black">
                {rentals.filter(r => r.status.includes('pending')).length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'inventory' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex flex-1 w-full gap-3">
                <div className="relative flex-1 max-w-md group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                  <input 
                    type="text" 
                    placeholder="기기명, 스펙 검색..." 
                    className="w-full pl-11 pr-4 py-3 rounded-xl bg-gray-50 border-transparent focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <select 
                  value={selectedCategory} 
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-5 py-3 rounded-xl bg-gray-50 border-transparent focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none font-semibold text-gray-700 transition-all cursor-pointer"
                >
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              
              <button onClick={openAddModal} className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition active:scale-95 shrink-0">
                <Plus size={18} className="mr-2" /> 새 기기 추가
              </button>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-gray-50/50 border-b border-gray-100 text-sm text-gray-500">
                      <th className="p-5 font-bold">이미지</th>
                      <th className="p-5 font-bold">기기 정보</th>
                      <th className="p-5 font-bold text-center">수량 현황</th>
                      <th className="p-5 font-bold text-center">상태 관리 (수리/정상)</th>
                      <th className="p-5 font-bold text-right">수정/삭제</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredItems.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50/80 transition-colors group">
                        <td className="p-5">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt="img" className="w-14 h-14 rounded-2xl object-cover shadow-sm border border-gray-200" />
                          ) : (
                            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 border border-gray-200"><ImageIcon size={20}/></div>
                          )}
                        </td>
                        <td className="p-5">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-blue-600 mb-1">{item.category}</span>
                            <span className="font-bold text-gray-900 text-base">{item.name}</span>
                            <span className="text-sm text-gray-500 mt-1 max-w-xs truncate">{item.spec}</span>
                          </div>
                        </td>
                        <td className="p-5 text-center">
                          <div className="inline-flex items-center justify-center bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
                            <span className={`font-black text-lg ${item.availableQuantity > 0 ? 'text-green-600' : 'text-red-500'}`}>{item.availableQuantity}</span>
                            <span className="text-gray-400 font-medium mx-2">/</span>
                            <span className="text-gray-700 font-bold text-lg">{item.totalQuantity || item.availableQuantity}</span>
                          </div>
                        </td>
                        <td className="p-5 text-center">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <button
                              onClick={() => toggleRepairStatus(item.id, item.isUnderRepair, item.name)}
                              className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-black ${
                                item.isUnderRepair ? 'bg-red-500' : 'bg-green-500'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                  item.isUnderRepair ? 'translate-x-7' : 'translate-x-0'
                                }`}
                              />
                            </button>
                            <span className={`text-xs font-bold ${item.isUnderRepair ? 'text-red-600' : 'text-green-600'}`}>
                              {item.isUnderRepair ? '수리 중 (대여 불가)' : '대여 가능'}
                            </span>
                          </div>
                        </td>
                        <td className="p-5 text-right">
                          <div className="flex items-center justify-end opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity gap-2">
                            <button onClick={() => openEditModal(item)} className="p-2.5 text-gray-500 hover:text-blue-600 transition-colors rounded-xl hover:bg-blue-50" title="수정">
                              <Edit size={18} />
                            </button>
                            <button onClick={() => deleteItem(item.id, item.name)} className="p-2.5 text-gray-400 hover:text-red-600 transition-colors rounded-xl hover:bg-red-50" title="삭제">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredItems.length === 0 && (
                      <tr><td colSpan={5} className="p-12 text-center text-gray-500 font-medium bg-gray-50/50">검색 결과가 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rentals' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
            {rentals.map(r => (
              <div key={r.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-md transition-shadow">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-black tracking-wide ${
                      r.status === 'rental_pending' ? 'bg-amber-100 text-amber-700' :
                      r.status === 'return_pending' ? 'bg-blue-100 text-blue-700' :
                      r.status === 'rented' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {r.status === 'rental_pending' ? '대여 승인 대기' :
                       r.status === 'return_pending' ? '반납 확인 대기' :
                       r.status === 'rented' ? '사용 중' : '처리 완료'}
                    </span>
                    <span className="text-sm font-semibold text-gray-400">{r.startDate} ~ {r.endDate}</span>
                  </div>
                  <h3 className="font-bold text-xl text-gray-900">{r.itemName}</h3>
                  <p className="text-sm font-medium text-gray-500 mt-1">신청자: <span className="text-gray-800">{r.userName}</span> ({r.userEmail})</p>
                  
                  {r.status === 'return_pending' && r.returnPhotoUrl && (
                    <div className="mt-4 bg-gray-50/80 p-4 rounded-2xl flex items-start gap-4 border border-gray-100">
                      <img src={r.returnPhotoUrl} alt="반납 사진" className="w-20 h-20 object-cover rounded-xl border border-gray-200 cursor-zoom-in shadow-sm hover:opacity-80 transition-opacity" onClick={()=>window.open(r.returnPhotoUrl)} />
                      <div>
                        <p className="text-xs font-bold text-blue-600 mb-1">반납 특이사항</p>
                        <p className="text-sm font-medium text-gray-800">{r.returnNote || '특이사항 없음'}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 shrink-0">
                  {r.status === 'rental_pending' && (
                    <>
                      <button onClick={() => handleRentalStatus(r.id, r.itemId, 'rented', items.find(i=>i.id===r.itemId)?.availableQuantity)} className="px-5 py-2.5 bg-black text-white text-sm font-bold rounded-xl shadow-lg shadow-black/20 hover:bg-gray-800 active:scale-95 transition-all">대여 승인</button>
                      <button onClick={() => handleRentalStatus(r.id, r.itemId, 'rejected', 0)} className="px-5 py-2.5 bg-red-50 text-red-600 text-sm font-bold rounded-xl hover:bg-red-100 active:scale-95 transition-all">거절</button>
                    </>
                  )}
                  {r.status === 'return_pending' && (
                    <button onClick={() => handleRentalStatus(r.id, r.itemId, 'returned', items.find(i=>i.id===r.itemId)?.availableQuantity)} className="px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-95 transition-all">반납 확인 (최종 완료)</button>
                  )}
                </div>
              </div>
            ))}
            {rentals.length === 0 && (
              <div className="bg-white rounded-3xl border border-gray-100 p-16 text-center shadow-sm">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-50 mb-4">
                  <ClipboardList className="text-gray-400" size={24} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">요청 내역이 없습니다</h3>
                <p className="text-gray-500 font-medium">현재 대기 중인 대여/반납 요청이 없습니다.</p>
              </div>
            )}
          </div>
        )}
      </main>

      <button
        onClick={() => navigate('/dashboard')}
        className="fixed bottom-8 right-8 bg-black text-white px-6 py-4 rounded-full shadow-2xl hover:shadow-black/30 hover:-translate-y-1 transition-all flex items-center gap-3 z-50 font-bold group"
      >
        <Home size={20} className="group-hover:scale-110 transition-transform duration-300" />
        사용자 화면으로 이동
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white/50 backdrop-blur-sm sticky top-0 z-10">
              <h2 className="text-2xl font-black text-gray-900">{editItemId ? '기기 정보 수정' : '새 기기 등록'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2.5 bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200 hover:text-gray-900 transition-colors"><X size={20} /></button>
            </div>
            
            <div className="px-8 py-6 overflow-y-auto max-h-[65vh] space-y-6">
              
              {/* 🔥 카메라 / 앨범 분리 로직 적용된 이미지 업로드 부분 */}
              <div>
                <label className="block text-sm font-black text-gray-800 mb-2.5">기기 이미지</label>
                <div className="relative w-full h-52 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50/50 overflow-hidden flex flex-col items-center justify-center">
                  
                  {isUploading ? (
                    <div className="flex flex-col items-center z-10">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
                      <span className="text-sm font-bold text-gray-600">이미지 업로드 중...</span>
                    </div>
                  ) : formData.imageUrl ? (
                    <>
                      <img src={formData.imageUrl} className="w-full h-full object-cover absolute inset-0 z-0" alt="미리보기" />
                      <label className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex flex-col items-center justify-center backdrop-blur-sm cursor-pointer z-10">
                        <span className="text-white font-bold text-sm bg-black/40 px-4 py-2 rounded-xl">사진 변경하기</span>
                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                      </label>
                    </>
                  ) : (
                    <div className="flex gap-4 z-10">
                      <label className="flex flex-col items-center justify-center w-28 h-28 bg-white rounded-2xl shadow-sm border border-gray-200 cursor-pointer hover:bg-gray-50 transition-all active:scale-95">
                        <Camera size={32} className="mb-3 text-blue-600" />
                        <span className="text-sm font-bold text-gray-700">바로 촬영</span>
                        {/* 🔥 capture="environment" 속성이 모바일 카메라를 직접 호출합니다 */}
                        <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleImageUpload} />
                      </label>
                      <label className="flex flex-col items-center justify-center w-28 h-28 bg-white rounded-2xl shadow-sm border border-gray-200 cursor-pointer hover:bg-gray-50 transition-all active:scale-95">
                        <ImageIcon size={32} className="mb-3 text-blue-600" />
                        <span className="text-sm font-bold text-gray-700">앨범 선택</span>
                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-black text-gray-800 mb-2.5">카테고리</label>
                  <input type="text" placeholder="예: 카메라, 노트북" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-4 py-3.5 rounded-xl bg-gray-50 border-transparent focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-medium" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-black text-gray-800 mb-2.5">기기명</label>
                  <input type="text" placeholder="정확한 모델명 입력" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3.5 rounded-xl bg-gray-50 border-transparent focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-medium" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-black text-gray-800 mb-2.5">상세 스펙 설명</label>
                <textarea placeholder="렌즈 종류, CPU 사양, 주의사항 등" value={formData.spec} onChange={e => setFormData({...formData, spec: e.target.value})} className="w-full px-4 py-3.5 rounded-xl bg-gray-50 border-transparent focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-medium h-28 resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-5 p-5 bg-gray-50 rounded-2xl border border-gray-100">
                <div>
                  <label className="block text-sm font-black text-gray-800 mb-2.5">전체 수량</label>
                  <input type="number" min="1" value={formData.totalQuantity} onChange={e => setFormData({...formData, totalQuantity: Number(e.target.value)})} className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-lg" />
                </div>
                <div>
                  <label className="block text-sm font-black text-gray-800 mb-2.5 text-blue-600">대여 가능 잔여 수량</label>
                  <input type="number" min="0" max={formData.totalQuantity} value={formData.availableQuantity} onChange={e => setFormData({...formData, availableQuantity: Number(e.target.value)})} className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-lg text-blue-600" />
                </div>
              </div>
            </div>

            <div className="px-8 py-5 border-t border-gray-100 bg-gray-50/50 flex gap-3 justify-end rounded-b-[2rem]">
              <button onClick={() => setIsModalOpen(false)} className="px-6 py-3.5 rounded-xl font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors">취소</button>
              <button onClick={saveItem} disabled={isUploading} className="px-8 py-3.5 rounded-xl font-bold text-white bg-blue-600 shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center active:scale-95">
                {editItemId ? <><Check size={18} className="mr-2" /> 수정 완료</> : <><Plus size={18} className="mr-2" /> 추가 완료</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}