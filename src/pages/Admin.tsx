import { useEffect, useState } from 'react';
import { ref, onValue, push, set, update, remove } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { 
  Search, Plus, Edit, Trash2, X, Image, 
  Loader2, Camera, Home, LayoutGrid, Grid, List, Zap, Bell, Clock, 
  ShieldAlert, CheckCircle, AlertCircle, ListOrdered, User, Calendar,
  Download, Mail, AlertOctagon // 💡 'Eye' 아이콘 완벽 제거
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore'; 

export default function Admin() {
  const navigate = useNavigate();
  const { user, role, userName } = useAuthStore(); 
  
  const ADMIN_EMAILS = ['inhak@gvcs-mg.org', 'hyeonung@gvcs-mg.org', 'mg224080441@gvcs-mg.org'];

  const [items, setItems] = useState<any[]>([]);
  const [rentals, setRentals] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('전체');

  const [viewMode, setViewMode] = useState<'large' | 'small' | 'text'>('text'); 
  const [isModalOpen, setIsModalOpen] = useState(false); 
  const [isRentalsModalOpen, setIsRentalsModalOpen] = useState(false); 
  const [reqTab, setReqTab] = useState<'all' | 'rental_pending' | 'return_pending' | 'extension_pending'>('rental_pending');
  const [editItemId, setEditItemId] = useState<string | null>(null);
  
  const [detailModal, setDetailModal] = useState<{ isOpen: boolean; rental: any }>({ isOpen: false, rental: null });
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  const [formData, setFormData] = useState({ 
    name: '', category: '', spec: '', totalQuantity: 1, availableQuantity: 1, imageUrl: '' 
  });
  const [isUploading, setIsUploading] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({ visible: false, message: '', type: 'success' });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
  };

  useEffect(() => {
    const isActualAdmin = role === 'admin' || (user?.email && ADMIN_EMAILS.includes(user.email));
    if (!user || !isActualAdmin) { 
      alert('접근 권한이 없습니다.');
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
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || (item.spec && item.spec.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch && (selectedCategory === '전체' || item.category === selectedCategory);
  });
  
  const countRentalPending = rentals.filter(r => r.status === 'rental_pending').length;
  const countReturnPending = rentals.filter(r => r.status === 'return_pending').length;
  const countExtensionPending = rentals.filter(r => r.status === 'extension_pending').length;
  const pendingCount = countRentalPending + countReturnPending + countExtensionPending;

  const activeRentedItems = rentals.filter(r => r.status === 'rented');

  // CSV 데이터 엑셀 내보내기 기능
  const downloadCSV = () => {
    if (rentals.length === 0) return showToast('다운로드할 데이터가 없습니다.', 'error');
    
    const headers = ['상태', '기기명', '신청자명', '이메일', '대여시작일', '반납예정일', '연장여부', '패널티여부', '특이사항'];
    const rows = rentals.map(r => {
      const statusMap: Record<string, string> = {
        rental_pending: '대여신청', return_pending: '반납신청', extension_pending: '연장신청',
        rented: '대여중', returned: '반납완료', rejected: '거절됨'
      };
      return [
        statusMap[r.status] || r.status,
        r.itemName,
        r.userName,
        r.userEmail,
        r.startDate || '',
        r.endDate || '',
        r.hasExtended ? 'O' : 'X',
        r.hasPenalty ? 'O' : 'X',
        (r.returnNote || '').replace(/,/g, ' ')
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `S212_대여기록_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('엑셀(CSV) 다운로드가 완료되었습니다.');
  };

  // 이메일 발송 도우미 (mailto)
  const sendEmail = (email: string, name: string, itemName: string, isOverdue: boolean) => {
    const subject = isOverdue 
      ? `[경고] S212 장비 반납 지연 안내 (${itemName})`
      : `[안내] S212 장비 대여 관련 안내 (${itemName})`;
    const body = `안녕하세요 ${name} 학생,\n\n장비명: ${itemName}\n\n${isOverdue ? '해당 장비의 반납 기한이 초과되었습니다. 신속한 반납을 부탁드리며, 미반납 시 패널티가 부여될 수 있습니다.' : '대여 관련 특이사항을 안내해 드립니다.'}\n\n- S212 관리자 드림 -`;
    
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // 연체 여부 체크 유틸리티 함수
  const checkIsOverdue = (endDate: string, status: string) => {
    if (!endDate || status !== 'rented') return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(endDate);
    return targetDate < today;
  };

  // 💡 사용하지 않는 'formatDateTime' 함수 제거 완료

  const openAddModal = () => { 
    setEditItemId(null); 
    setFormData({ name: '', category: '', spec: '', totalQuantity: 1, availableQuantity: 1, imageUrl: '' }); 
    setIsModalOpen(true); 
  };
  
  const openEditModal = (item: any) => { 
    setEditItemId(item.id); 
    setFormData({ 
      name: item.name, category: item.category, spec: item.spec || '', 
      totalQuantity: item.totalQuantity || item.availableQuantity, availableQuantity: item.availableQuantity, imageUrl: item.imageUrl || '' 
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
      const res = await fetch(`https://api.cloudinary.com/v1_1/dfl2cn6o6/image/upload`, { method: 'POST', body: uploadData });
      const data = await res.json(); 
      if (!res.ok) throw new Error(data.error?.message || '업로드 실패');
      setFormData(prev => ({ ...prev, imageUrl: data.secure_url }));
      showToast('사진이 업로드되었습니다.');
    } catch (error) { 
      showToast('이미지 업로드 실패', 'error'); 
    } finally { 
      setIsUploading(false); 
    }
  };

  const saveItem = async () => {
    if (!formData.name || !formData.category) return showToast('기기명과 카테고리는 필수입니다.', 'error');
    try {
      if (editItemId) await update(ref(rtdb, `items/${editItemId}`), formData); 
      else await set(push(ref(rtdb, 'items')), { ...formData, isUnderRepair: false }); 
      setIsModalOpen(false);
      showToast(editItemId ? '장비가 수정되었습니다.' : '새 장비가 등록되었습니다.');
    } catch (e) { showToast('저장 중 오류 발생', 'error'); }
  };

  const deleteItem = async (id: string, name: string) => {
    if (window.confirm(`정말 '${name}' 기기를 삭제하시겠습니까?`)) {
      await remove(ref(rtdb, `items/${id}`)); 
      showToast('기기가 삭제되었습니다.');
    }
  };

  const toggleRepairStatus = async (id: string, currentStatus: boolean, name: string) => {
    const action = currentStatus ? '정상(대여 가능)' : '수리 중(대여 불가)';
    if (window.confirm(`'${name}' 기기를 [${action}] 상태로 변경하시겠습니까?`)) {
      await update(ref(rtdb, `items/${id}`), { isUnderRepair: !currentStatus });
      showToast('상태가 변경되었습니다.');
    }
  };

  const handleRentalStatus = async (rentalId: string, itemId: string, newStatus: string) => {
    try {
      const itemObj = items.find(i => i.id === itemId);
      
      if (newStatus === 'rented') {
        if (!itemObj || itemObj.availableQuantity <= 0) {
          return showToast('현재 잔여 재고가 없어 대여를 승인할 수 없습니다.', 'error');
        }
        if (itemObj.isUnderRepair) {
          return showToast('현재 수리 중인 장비이므로 승인할 수 없습니다.', 'error');
        }
        await update(ref(rtdb, `items/${itemId}`), { availableQuantity: itemObj.availableQuantity - 1 });
      }
      
      if (newStatus === 'returned') {
        if (itemObj) {
          await update(ref(rtdb, `items/${itemId}`), { 
            availableQuantity: Math.min(itemObj.totalQuantity, itemObj.availableQuantity + 1) 
          });
        }
      }

      await update(ref(rtdb, `rentals/${rentalId}`), { status: newStatus, processedAt: new Date().toISOString() });
      showToast('요청이 처리되었습니다.');
    } catch (error) { 
      showToast('처리 중 오류 발생', 'error'); 
    }
  };

  const applyPenalty = async (rentalId: string) => {
    if (window.confirm('이 학생에게 연체/파손 사유로 패널티 기록을 남기시겠습니까?')) {
      try {
        await update(ref(rtdb, `rentals/${rentalId}`), { hasPenalty: true });
        showToast('패널티가 부여되었습니다.', 'error');
        setDetailModal(prev => ({ ...prev, rental: { ...prev.rental, hasPenalty: true } }));
      } catch (e) {
        showToast('패널티 부여 실패', 'error');
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-gray-200 font-sans pb-32 selection:bg-cyan-500/30">
      
      <header className="absolute top-0 w-full z-40 px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="text-cyan-400" size={24} />
          <h1 className="text-xl font-bold tracking-tighter text-white">S212 ADMIN</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsStatusModalOpen(true)}
            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-full text-xs font-bold transition-all shadow-[0_0_15px_rgba(168,85,247,0.2)] active:scale-95"
          >
            <ListOrdered size={14} /> 실시간 물품 대여 현황 
            <span className="bg-white/20 text-white px-2 py-0.5 rounded-full text-[10px] font-black ml-1">
              {activeRentedItems.length}건
            </span>
          </button>

          <button 
            onClick={() => setIsRentalsModalOpen(true)}
            className="relative flex items-center justify-center w-11 h-11 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all text-white backdrop-blur-md"
          >
            <Bell size={20} className={pendingCount > 0 ? "text-cyan-400 animate-pulse" : "text-gray-400"} />
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white shadow-lg border border-black">
                {pendingCount}
              </span>
            )}
          </button>
          
          <button 
            onClick={() => navigate('/dashboard')} 
            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-xs font-bold transition-all text-gray-300 hover:text-white"
          >
            <Home size={16} /> USER APP
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-32 sm:pt-36 flex flex-col items-center">
        
        <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4 text-center animate-in fade-in slide-in-from-bottom-5 duration-700">
          <span className="text-white">{userName}</span> 관리자님
        </h2>
        {pendingCount > 0 ? (
          <div onClick={() => setIsRentalsModalOpen(true)} className="cursor-pointer mb-10 px-5 py-2.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-sm font-bold flex items-center gap-2 animate-in fade-in zoom-in-95 shadow-[0_0_15px_rgba(6,182,212,0.2)] hover:bg-cyan-500/20 transition-all">
            <Bell size={16} className="animate-bounce" /> {pendingCount}개의 처리 대기 중인 요청이 있습니다!
          </div>
        ) : (
          <p className="text-gray-500 mb-10 text-sm animate-in fade-in">현재 대기 중인 대여/반납 요청이 없습니다.</p>
        )}

        <button
          onClick={() => setIsStatusModalOpen(true)}
          className="sm:hidden flex items-center gap-2 px-6 py-3 mb-8 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-2xl text-sm font-bold transition-all"
        >
          <ListOrdered size={16} /> 실시간 물품 대여 현황 ({activeRentedItems.length}건)
        </button>

        <div className="w-full max-w-2xl relative group mb-12 animate-in fade-in zoom-in-95 duration-700 delay-100">
          <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-3xl blur opacity-10 group-focus-within:opacity-30 transition duration-500"></div>
          <div className="relative flex items-center bg-[#0f1115] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <Search className="absolute left-5 text-gray-500 group-focus-within:text-cyan-400 transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="관리할 장비 검색 (이름, 스펙)..." 
              className="w-full pl-14 pr-6 py-4 bg-transparent border-none text-white text-base font-medium focus:ring-0 outline-none placeholder-gray-600" 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>
        </div>

        <div className="w-full flex flex-col sm:flex-row justify-between items-center gap-4 mb-8 animate-in fade-in duration-500 delay-200">
          <div className="flex gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 scrollbar-hide">
            <button onClick={openAddModal} className="shrink-0 flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-bold bg-white text-black hover:bg-gray-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)]">
              <Plus size={16} /> 새 장비 등록
            </button>
            <div className="w-px h-6 bg-white/10 mx-2 self-center hidden sm:block"></div>
            {categories.map(cat => (
              <button 
                key={cat} 
                onClick={() => setSelectedCategory(cat)} 
                className={`px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all border ${selectedCategory === cat ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : 'bg-transparent text-gray-500 border-white/5 hover:text-white hover:border-white/20'}`}
              >
                {cat}
              </button>
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
                <div key={item.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 bg-[#0f1115] border border-white/5 rounded-2xl transition-all hover:bg-white/5 group gap-4">
                  <div className="flex items-center gap-4">
                    {item.imageUrl ? <img src={item.imageUrl} className="w-12 h-12 rounded-lg object-cover border border-white/10" /> : <div className="w-12 h-12 rounded-lg bg-black/50 flex items-center justify-center text-gray-700 border border-white/10"><Zap size={16}/></div>}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-medium text-cyan-500/70 border border-cyan-500/20 px-1.5 py-0.5 rounded">{item.category}</span>
                        <span className="font-bold text-white text-base">{item.name}</span>
                      </div>
                      <span className="text-sm text-gray-500 truncate max-w-sm">{item.spec}</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
                    <div className="flex bg-black/50 rounded-lg p-1 border border-white/5 mr-2">
                      <button onClick={() => toggleRepairStatus(item.id, item.isUnderRepair, item.name)} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${!item.isUnderRepair ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500 hover:text-white'}`}>정상</button>
                      <button onClick={() => toggleRepairStatus(item.id, item.isUnderRepair, item.name)} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${item.isUnderRepair ? 'bg-red-500/20 text-red-400' : 'text-gray-500 hover:text-white'}`}>수리</button>
                    </div>
                    <span className="text-lg font-bold text-white w-8 text-center">{item.availableQuantity}</span>
                    <span className="text-gray-600">/</span>
                    <span className="text-sm text-gray-500 w-6">{item.totalQuantity}</span>
                    
                    <div className="flex items-center gap-1 ml-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEditModal(item)} className="p-2.5 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all"><Edit size={16} /></button>
                      <button onClick={() => deleteItem(item.id, item.name)} className="p-2.5 text-gray-400 hover:text-red-400 bg-white/5 hover:bg-red-500/10 rounded-xl transition-all"><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={item.id} className="group bg-[#0f1115] rounded-[24px] border border-white/5 overflow-hidden transition-all duration-300 hover:border-white/20 hover:shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
                <div className={`relative bg-black/50 overflow-hidden ${viewMode === 'large' ? 'aspect-video' : 'aspect-square'}`}>
                  {item.imageUrl ? <img src={item.imageUrl} className={`w-full h-full object-cover transition-transform duration-700 ${isUnavailable ? 'opacity-40 grayscale' : 'group-hover:scale-105'}`} /> : <div className="w-full h-full flex items-center justify-center text-gray-700"><Zap size={48} className="opacity-20"/></div>}
                  <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] font-medium text-white border border-white/10">{item.category}</div>
                  
                  <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEditModal(item)} className="p-2 bg-black/60 backdrop-blur-md text-gray-300 hover:text-white rounded-full border border-white/10"><Edit size={14}/></button>
                    <button onClick={() => deleteItem(item.id, item.name)} className="p-2 bg-black/60 backdrop-blur-md text-gray-300 hover:text-red-400 rounded-full border border-white/10"><Trash2 size={14}/></button>
                  </div>
                </div>
                <div className={`p-5 flex flex-col justify-between ${viewMode === 'small' ? 'p-4' : 'h-36'}`}>
                  <div>
                    <h3 className={`font-bold text-white truncate mb-1 ${viewMode === 'small' ? 'text-sm' : 'text-lg'}`}>{item.name}</h3>
                    {viewMode === 'large' && <p className="text-sm text-gray-500 line-clamp-1 mb-4">{item.spec || '스펙 정보 없음'}</p>}
                  </div>
                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-sm font-bold text-white">{item.availableQuantity} <span className="text-gray-500 font-normal">/ {item.totalQuantity}</span></span>
                    
                    <div className="flex bg-black/50 rounded-lg p-1 border border-white/5">
                      <button onClick={() => toggleRepairStatus(item.id, item.isUnderRepair, item.name)} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${!item.isUnderRepair ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500 hover:text-white'}`}>ON</button>
                      <button onClick={() => toggleRepairStatus(item.id, item.isUnderRepair, item.name)} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${item.isUnderRepair ? 'bg-red-500/20 text-red-400' : 'text-gray-500 hover:text-white'}`}>OFF</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* ==================== 실시간 물품 대여 현황판 모달 ==================== */}
      {isStatusModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#0f1115] border border-white/10 rounded-3xl w-full max-w-3xl p-6 shadow-2xl relative flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <div className="flex items-center gap-2">
                <ListOrdered className="text-purple-400" size={20} />
                <div>
                  <h3 className="text-lg font-bold text-white">실시간 전체 대여 현황</h3>
                  <p className="text-xs text-gray-500">현재 승인되어 사용 중인 기기 목록입니다.</p>
                </div>
              </div>
              <button onClick={() => setIsStatusModalOpen(false)} className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors"><X size={20}/></button>
            </div>

            <div className="overflow-y-auto flex-1 pr-1 space-y-3 scrollbar-hide">
              {activeRentedItems.length === 0 ? (
                <div className="py-20 text-center text-gray-500 text-sm border border-dashed border-white/5 rounded-2xl">현재 대여 중인 기자재가 없습니다.</div>
              ) : (
                activeRentedItems.map((rental) => {
                  const isOverdue = checkIsOverdue(rental.endDate, rental.status);
                  
                  return (
                    <div key={rental.id} className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors hover:bg-white/5 ${isOverdue ? 'bg-red-500/5 border-red-500/30' : 'bg-black/40 border-white/5'}`}>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          {isOverdue && <AlertOctagon size={14} className="text-red-500 animate-pulse" />}
                          <span className={`font-bold text-base ${isOverdue ? 'text-red-400' : 'text-white'}`}>{rental.itemName}</span>
                          {rental.hasExtended && (
                            <span className="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded text-[10px] font-bold border border-purple-500/20">1회 연장됨</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-gray-400 text-xs">
                          <span className="flex items-center gap-1 text-cyan-400"><User size={14}/> {rental.userName}</span>
                          <span className="flex items-center gap-1"><Calendar size={14}/> {rental.startDate}</span>
                          <span className={`flex items-center gap-1 font-bold ${isOverdue ? 'text-red-500' : 'text-amber-400'}`}><Clock size={14}/> ~ {rental.endDate} 반납 {isOverdue && '(연체됨!)'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => sendEmail(rental.userEmail, rental.userName, rental.itemName, isOverdue)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"><Mail size={16}/></button>
                        <span className={`px-3 py-1.5 rounded-lg border font-bold text-[11px] ${isOverdue ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'}`}>
                          {isOverdue ? '연체 발생' : '정상 사용 중'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== 요청 관리 / 알림 대기열 사이드바 ==================== */}
      {isRentalsModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex justify-end">
          <div className="w-full max-w-lg bg-[#0f1115] h-full border-l border-white/10 p-6 sm:p-8 animate-in slide-in-from-right duration-300 overflow-y-auto">
            
            <div className="mb-6 sticky top-0 bg-[#0f1115] z-10 pt-2 pb-4 border-b border-white/5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  요청 대기열 <span className="bg-cyan-500 text-black px-2 py-0.5 rounded-full text-sm font-black">{pendingCount}</span>
                </h2>
                <div className="flex items-center gap-2">
                  <button onClick={downloadCSV} className="p-2 text-green-400 hover:text-green-300 hover:bg-green-500/10 rounded-full transition-all" title="엑셀로 내보내기">
                    <Download size={20} />
                  </button>
                  <button onClick={() => setIsRentalsModalOpen(false)} className="text-gray-400 hover:text-white transition-colors"><X size={24} /></button>
                </div>
              </div>
              
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
                {[
                  { id: 'rental_pending', label: '대여 신청', count: countRentalPending },
                  { id: 'return_pending', label: '반납 신청', count: countReturnPending },
                  { id: 'extension_pending', label: '연장 신청', count: countExtensionPending },
                  { id: 'all', label: '전체 로그', count: 0 }
                ].map(tab => (
                  <button 
                    key={tab.id}
                    onClick={() => setReqTab(tab.id as any)}
                    className={`relative px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      reqTab === tab.id ? 'bg-cyan-500 text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {tab.label}
                    {tab.count > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${reqTab === tab.id ? 'bg-black text-white' : 'bg-red-500 text-white'}`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="space-y-4">
              {rentals
                .filter(r => reqTab === 'all' ? true : r.status === reqTab)
                .map(r => (
                  <div 
                    key={r.id} 
                    onClick={() => setDetailModal({ isOpen: true, rental: r })}
                    className={`p-5 rounded-2xl border cursor-pointer transition-all flex flex-col gap-3 relative overflow-hidden group ${
                      r.hasPenalty ? 'bg-red-950/20 border-red-500/30 hover:bg-red-900/30' : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20'
                    }`}
                  >
                    {r.status.includes('pending') && <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500 animate-pulse" />}
                    
                    <div className="flex justify-between items-start">
                      <div className="w-full">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wide ${
                            r.status === 'rental_pending' ? 'bg-amber-500 text-black' :
                            r.status === 'return_pending' ? 'bg-blue-500 text-white' : 
                            r.status === 'extension_pending' ? 'bg-purple-500 text-white' :
                            r.status === 'rented' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/20' :
                            r.status === 'returned' ? 'bg-gray-500/20 text-gray-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {r.status === 'rental_pending' ? '대여 신청' : 
                             r.status === 'return_pending' ? '반납 신청' : 
                             r.status === 'extension_pending' ? '연장 신청' : 
                             r.status === 'rented' ? '대여 중' : 
                             r.status === 'returned' ? '반납 완료' : '거절됨'}
                          </span>
                          <span className="text-xs font-bold text-gray-400">{r.userName}</span>
                          {r.hasPenalty && <span className="text-[10px] bg-red-500 text-white px-1.5 rounded-sm font-bold">패널티</span>}
                        </div>
                        <h3 className="font-bold text-base text-white truncate max-w-xs">{r.itemName}</h3>
                      </div>
                    </div>

                    {r.returnNote && (
                      <p className="text-xs text-amber-400 line-clamp-1 bg-amber-500/5 px-2.5 py-1.5 rounded-lg border border-amber-500/10">💬 피드백: {r.returnNote}</p>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== 로그 상세 팝업 모달 ==================== */}
      {detailModal.isOpen && detailModal.rental && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[120] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#0f1115] border border-white/10 rounded-[32px] w-full max-w-md p-8 shadow-2xl overflow-y-auto max-h-[90vh] scrollbar-hide relative">
            
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/5">
              <div>
                <span className="text-xs font-bold text-cyan-400 block mb-1">S212 RENTAL LOG SYSTEM</span>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  상세 정보 검토
                  {detailModal.rental.hasPenalty && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full uppercase">패널티 적용됨</span>}
                </h2>
              </div>
              <button 
                onClick={() => setDetailModal({ isOpen: false, rental: null })} 
                className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 text-sm">
              <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-0.5">계정 이메일</label>
                  <p className="text-xs text-gray-300 truncate mt-0.5">{detailModal.rental.userEmail}</p>
                </div>
                {/* 💡 'isOverdue' 컴파일 에러 해결을 위해 인라인 삼항연산자로 조건 직접 투입 */}
                <button onClick={() => sendEmail(detailModal.rental.userEmail, detailModal.rental.userName, detailModal.rental.itemName, checkIsOverdue(detailModal.rental.endDate, detailModal.rental.status))} className="px-3 py-1.5 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500 hover:text-black border border-cyan-500/30 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5">
                  <Mail size={12}/> 안내/경고 메일 보내기
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">대여 요청 시작일</label>
                  <p className="text-white font-medium bg-white/5 p-2.5 rounded-lg text-center border border-white/5">{detailModal.rental.startDate || '-'}</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">반납 예정일</label>
                  <p className={`font-medium p-2.5 rounded-lg text-center border ${checkIsOverdue(detailModal.rental.endDate, detailModal.rental.status) ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-white/5 text-white border-white/5'}`}>
                    {detailModal.rental.endDate || '-'}
                  </p>
                </div>
              </div>

              {(detailModal.rental.returnPhotoUrl || detailModal.rental.returnNote) && (
                <div className="space-y-3 p-4 bg-black/40 rounded-2xl border border-white/5">
                  <label className="block text-xs font-bold text-blue-400">📦 반납 회수 로그 (유저 피드백 및 기기 상태)</label>
                  
                  {detailModal.rental.returnPhotoUrl && (
                    <div>
                      <img 
                        src={detailModal.rental.returnPhotoUrl} 
                        className="w-full h-44 object-cover rounded-xl border border-white/10 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => window.open(detailModal.rental.returnPhotoUrl, '_blank')}
                      />
                    </div>
                  )}

                  {detailModal.rental.returnNote && (
                    <div className="text-xs text-gray-200 bg-white/5 p-3 rounded-xl whitespace-pre-wrap leading-relaxed border border-white/5 font-sans">
                      {detailModal.rental.returnNote}
                    </div>
                  )}
                </div>
              )}
            </div>

            {!detailModal.rental.hasPenalty && detailModal.rental.status !== 'rejected' && (
              <div className="mt-6 p-4 bg-red-950/30 border border-red-900/50 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-red-400 mb-0.5 flex items-center gap-1"><AlertOctagon size={12}/> 규정 위반 관리</h4>
                  <p className="text-[10px] text-gray-400">파손 및 지연 연체 시 패널티를 부여합니다.</p>
                </div>
                <button onClick={() => applyPenalty(detailModal.rental.id)} className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-all">패널티 적용</button>
              </div>
            )}

            {detailModal.rental.status.includes('pending') && (
              <div className="flex gap-3 mt-6 pt-4 border-t border-white/5">
                {detailModal.rental.status === 'rental_pending' && (
                  <>
                    <button onClick={() => { handleRentalStatus(detailModal.rental.id, detailModal.rental.itemId, 'rented'); setDetailModal({ isOpen: false, rental: null }); }} className="flex-1 py-3 bg-white text-black text-sm font-bold rounded-xl hover:bg-gray-200 transition active:scale-95">대여 승인</button>
                    <button onClick={() => { handleRentalStatus(detailModal.rental.id, detailModal.rental.itemId, 'rejected'); setDetailModal({ isOpen: false, rental: null }); }} className="flex-1 py-3 bg-white/5 text-red-400 text-sm font-bold rounded-xl hover:bg-red-500/20 transition border border-red-500/10 active:scale-95">거절</button>
                  </>
                )}
                {detailModal.rental.status === 'return_pending' && (
                  <button onClick={() => { handleRentalStatus(detailModal.rental.id, detailModal.rental.itemId, 'returned'); setDetailModal({ isOpen: false, rental: null }); }} className="w-full py-3 bg-cyan-500 text-black text-sm font-bold rounded-xl hover:bg-cyan-400 transition active:scale-95">반납 최종 확인</button>
                )}
                {detailModal.rental.status === 'extension_pending' && (
                  <>
                    <button onClick={() => {
                       update(ref(rtdb, `rentals/${detailModal.rental.id}`), { status: 'rented', endDate: detailModal.rental.requestedExtensionDate, hasExtended: true });
                       showToast('연장이 승인되었습니다.');
                       setDetailModal({ isOpen: false, rental: null });
                    }} className="flex-1 py-3 bg-purple-500 text-white text-sm font-bold rounded-xl hover:bg-purple-400 transition active:scale-95">연장 승인</button>
                    <button onClick={() => {
                       update(ref(rtdb, `rentals/${detailModal.rental.id}`), { status: 'rented' });
                       showToast('연장을 거절했습니다.');
                       setDetailModal({ isOpen: false, rental: null });
                    }} className="flex-1 py-3 bg-white/5 text-red-400 text-sm font-bold rounded-xl hover:bg-red-500/20 transition active:scale-95">거절</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-[#0f1115] border border-white/10 rounded-[32px] w-full max-w-xl p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold text-white">{editItemId ? '장비 정보 수정' : '새 장비 등록'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-white transition-colors"><X size={24} /></button>
            </div>
            
            <div className="overflow-y-auto max-h-[60vh] space-y-6 pr-2 mb-8 scrollbar-hide">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">장비 사진</label>
                <div className="relative w-full h-48 rounded-2xl border border-dashed border-white/20 bg-white/5 overflow-hidden flex flex-col items-center justify-center">
                  {isUploading ? (
                    <div className="flex flex-col items-center text-cyan-500">
                      <Loader2 className="w-8 h-8 animate-spin mb-3" />
                      <span className="text-sm font-bold">업로드 중...</span>
                    </div>
                  ) : formData.imageUrl ? (
                    <>
                      <img src={formData.imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-80" />
                      <label className="z-10 bg-black/60 px-4 py-2 text-sm font-bold rounded-full cursor-pointer text-white backdrop-blur-md hover:bg-black/80 transition-colors">
                        사진 변경<input type="file" className="hidden" accept="image/*" onChange={handleImageUpload}/>
                      </label>
                    </>
                  ) : (
                    <div className="flex gap-4 z-10">
                      <label className="flex flex-col items-center justify-center w-28 h-28 bg-white/5 rounded-2xl border border-white/10 cursor-pointer hover:bg-white/10 transition-all active:scale-95">
                        <Camera size={28} className="mb-3 text-cyan-400" />
                        <span className="text-xs font-medium text-gray-300">바로 촬영</span>
                        <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleImageUpload} />
                      </label>
                      <label className="flex flex-col items-center justify-center w-28 h-28 bg-white/5 rounded-2xl border border-white/10 cursor-pointer hover:bg-white/10 transition-all active:scale-95">
                        <Image size={28} className="mb-3 text-cyan-400" />
                        <span className="text-xs font-medium text-gray-300">앨범 선택</span>
                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div><label className="block text-sm font-medium text-gray-400 mb-2">카테고리</label><input type="text" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-5 py-4 rounded-xl bg-white/5 border border-transparent text-white focus:border-cyan-500 outline-none transition-all text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-400 mb-2">기기명</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-5 py-4 rounded-xl bg-white/5 border border-transparent text-white focus:border-cyan-500 outline-none transition-all text-sm" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-400 mb-2">상세 스펙</label><textarea value={formData.spec} onChange={e => setFormData({...formData, spec: e.target.value})} className="w-full px-5 py-4 rounded-xl bg-white/5 border border-transparent text-white focus:border-cyan-500 h-28 resize-none outline-none transition-all text-sm" /></div>
              <div className="grid grid-cols-2 gap-5">
                <div><label className="block text-sm font-medium text-gray-400 mb-2">전체 수량</label><input type="number" min="1" value={formData.totalQuantity} onChange={e => setFormData({...formData, totalQuantity: Number(e.target.value)})} className="w-full px-5 py-4 rounded-xl bg-white/5 border border-transparent text-white focus:border-cyan-500 outline-none transition-all text-lg font-bold" /></div>
                <div><label className="block text-sm font-bold text-cyan-400 mb-2">대여 가능 수량</label><input type="number" min="0" max={formData.totalQuantity} value={formData.availableQuantity} onChange={e => setFormData({...formData, availableQuantity: Number(e.target.value)})} className="w-full px-5 py-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 focus:border-cyan-400 outline-none transition-all text-lg font-bold" /></div>
              </div>
            </div>

            <button onClick={saveItem} disabled={isUploading} className="w-full bg-white text-black py-4 rounded-xl font-bold hover:bg-gray-200 transition-all disabled:opacity-50 active:scale-95 text-base">
              {editItemId ? '수정 완료' : '등록 완료'}
            </button>
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