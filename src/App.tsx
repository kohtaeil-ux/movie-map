import React, { useEffect, useRef, useState } from 'react';

declare const L: any; // Leaflet 전역 객체 선언

interface LocationItem {
  MovieTitle: string;
  LocationName: string;
  Coordinates: string;
  SceneImageUrl: string;
  Description: string;
  YoutubeUrl: string;
  PosterUrl?: string;
  Address?: string;
  Genre?: string;
  YoutubeMusicUrl?: string;
  lat: number;
  lng: number;
}

interface UserRecord {
  isLiked: boolean;
  visitHistory?: string[];
}

export default function App() {
  const mapRef = useRef<HTMLDivElement>(null);
  const adRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<any>(null);
  const [allData, setAllData] = useState<LocationItem[]>([]);
  const [markers, setMarkers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMovie, setSelectedMovie] = useState<string>('');
  const [myLocationMarker, setMyLocationMarker] = useState<any>(null);
  const [activePopupItem, setActivePopupItem] = useState<LocationItem | null>(null);
  const [viewMode, setViewMode] = useState('전체');

  // 마이페이지 / 서랍 모달 상태
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'liked' | 'visited'>('liked');

  // 기부 및 요청 팝업 상태
  const [isDonateOpen, setIsDonateOpen] = useState(false);
  const [requestMovieTitle, setRequestMovieTitle] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [userRecords, setUserRecords] = useState<{ [key: string]: UserRecord }>(() => {
    try {
      const saved = localStorage.getItem('movie_map_user_records_v3');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const modeList = ['전체', '영화', '드라마', '애니', '뮤비', '게임'];
  const modeEmojis: { [key: string]: string } = { '전체': '🗺️', '영화': '🎬', '드라마': '📺', '애니': '✨', '뮤비': '🎵', '게임': '🎮' };

  const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQEKtaZqTTM8UOBscio1E6ubJIzoFrte9oWOUtS69SpDBAjT4NuQIYwFKI6tRTr9Kd7nu3i9fHrdlb6/pub?output=csv';
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzyrIsG3bJeT7HHrwm3UsiQr4tA-cO1sRUzpAbhESgZmqR8d-aSeGopukAD8c1VUNwQ/exec';

  useEffect(() => {
    try {
      localStorage.setItem('movie_map_user_records_v3', JSON.stringify(userRecords));
    } catch (e) {
      console.error('저장 실패:', e);
    }
  }, [userRecords]);

  // 카카오 애드핏 스크립트 동적 로드
  useEffect(() => {
    if (!adRef.current) return;
    if (adRef.current.querySelector('ins')) return;

    const ins = document.createElement('ins');
    ins.className = 'kakao_ad_area';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-unit', 'DAN-aCmZuetEmgPKCiwf');
    ins.setAttribute('data-ad-width', '320');
    ins.setAttribute('data-ad-height', '50');

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = '//t1.kakaocdn.net/kas/static/ba.min.js';
    script.async = true;

    adRef.current.appendChild(ins);
    adRef.current.appendChild(script);
  }, []);

  const parseCSVLine = (textLine: string) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < textLine.length; i++) {
      const char = textLine[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
  };

  const parseCSV = (text: string): LocationItem[] => {
    const lines = text.split('\n');
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]);
    const result: LocationItem[] = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const currentLine = parseCSVLine(lines[i]);
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = currentLine[index] ? currentLine[index] : '';
      });

      const coordRaw = obj.Coordinates || '';
      if (coordRaw.includes(',')) {
        const parts = coordRaw.split(',');
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          obj.lat = lat;
          obj.lng = lng;
          result.push(obj);
        }
      }
    }
    return result;
  };

  // Leaflet 지도 초기화
  useEffect(() => {
    if (!mapRef.current || !window.L) return;

    if (mapRef.current._leaflet_id) {
      mapRef.current._leaflet_id = null;
    }

    const map = L.map(mapRef.current, {
      center: [36.5, 127.5],
      zoom: 7,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    setMapInstance(map);

    fetch(SHEET_CSV_URL)
      .then((res) => res.text())
      .then((csvText) => {
        const parsedData = parseCSV(csvText);
        setAllData(parsedData);
      })
      .catch((err) => {
        console.error('데이터 로드 실패:', err);
      });

    return () => {
      map.remove();
    };
  }, []);

  const toggleLike = (key: string) => {
    setUserRecords((prev) => {
      const current = prev[key] || { isLiked: false, visitHistory: [] };
      return {
        ...prev,
        [key]: { ...current, isLiked: !current.isLiked },
      };
    });
  };

  const addVisit = (key: string) => {
    const now = new Date();
    const timeString = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    setUserRecords((prev) => {
      const current = prev[key] || { isLiked: false, visitHistory: [] };
      const history = current.visitHistory ? [...current.visitHistory, timeString] : [timeString];
      return {
        ...prev,
        [key]: { ...current, visitHistory: history },
      };
    });
  };

  const removeVisit = (key: string, indexToRemove: number) => {
    setUserRecords((prev) => {
      const current = prev[key];
      if (!current || !current.visitHistory) return prev;
      const history = current.visitHistory.filter((_, idx) => idx !== indexToRemove);
      return {
        ...prev,
        [key]: { ...current, visitHistory: history },
      };
    });
  };

  const movieMap = new Map();
  allData.forEach((item) => {
    if (!movieMap.has(item.MovieTitle)) {
      movieMap.set(item.MovieTitle, item);
    }
  });
  const uniqueMovies = Array.from(movieMap.values()) as LocationItem[];

  const filteredItems = viewMode === '전체' 
     ? uniqueMovies 
     : uniqueMovies.filter(item => item.Genre === viewMode);

  // 마커 렌더링 및 검색/필터 연동
  useEffect(() => {
    if (!mapInstance || allData.length === 0) return;

    markers.forEach((m) => m.remove());
    const newMarkers: any[] = [];
    let firstMatchLatLng = null;

    const query = searchTerm.toLowerCase();

    allData.forEach((item) => {
      const matchesSearch =
        item.MovieTitle.toLowerCase().includes(query) ||
        item.LocationName.toLowerCase().includes(query) ||
        (item.Description && item.Description.toLowerCase().includes(query)) ||
        (item.Address && item.Address.toLowerCase().includes(query));

      const matchesSelectedMovie = selectedMovie ? item.MovieTitle === selectedMovie : true;
      const matchesViewMode = viewMode === '전체' ? true : item.Genre === viewMode;

      if (searchTerm && !matchesSearch) return;
      if (selectedMovie && !matchesSelectedMovie) return;
      if (!searchTerm && !selectedMovie && !matchesViewMode) return;

      const latLng = [item.lat, item.lng];

      if (!firstMatchLatLng) {
        firstMatchLatLng = latLng;
      }

      const marker = L.marker(latLng).addTo(mapInstance);
      marker.bindTooltip(item.LocationName, { direction: 'top', offset: [0, -20] });

      marker.on('click', () => {
        setActivePopupItem(item);
        mapInstance.panTo(latLng);
      });

      newMarkers.push(marker);
    });

    setMarkers(newMarkers);

    if ((searchTerm || selectedMovie) && firstMatchLatLng) {
      mapInstance.setView(firstMatchLatLng, 12);
    }
  }, [searchTerm, selectedMovie, viewMode, allData, mapInstance]);

  const handlePanToCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('이 브라우저는 위치 정보를 지원하지 않습니다.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latLng = [position.coords.latitude, position.coords.longitude];
        mapInstance.setView(latLng, 14);

        if (myLocationMarker) {
          myLocationMarker.remove();
        }

        const customIcon = L.divIcon({
          className: 'custom-user-marker',
          html: '<div style="background:#4285F4; width:16px; height:16px; border-radius:50%; border:2px solid white; box-shadow:0 0 6px rgba(0,0,0,0.3);"></div>',
          iconSize: [16, 16],
        });

        const marker = L.marker(latLng, { icon: customIcon }).addTo(mapInstance);
        setMyLocationMarker(marker);
      },
      () => {
        alert('위치 정보를 가져오는 데 실패했습니다. 위치 권한을 확인해주세요.');
      }
    );
  };

  const handleSelectLocationFromDrawer = (item: LocationItem) => {
    setIsDrawerOpen(false);
    setActivePopupItem(item);
    if (mapInstance) {
      mapInstance.setView([item.lat, item.lng], 14);
    }
  };

  const handleRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestMovieTitle.trim()) {
      alert('요청하실 영화 제목을 입력해주세요.');
      return;
    }

    setIsSubmitting(true);

    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        movieTitle: requestMovieTitle,
        message: requestMessage,
      }),
    })
      .then(() => {
        alert('영화 요청이 성공적으로 접수되었습니다! 소중한 의견 감사합니다.');
        setRequestMovieTitle('');
        setRequestMessage('');
        setIsSubmitting(false);
      })
      .catch((err) => {
        console.error('요청 전송 실패:', err);
        alert('전송 중 오류가 발생했습니다. 다시 시도해 주세요.');
        setIsSubmitting(false);
      });
  };

  const activeRecordKey = activePopupItem ? `${activePopupItem.MovieTitle}_${activePopupItem.LocationName}` : '';
  const activeRecord = userRecords[activeRecordKey] || { isLiked: false, visitHistory: [] };

  const likedItems = allData.filter((item) => {
    const key = `${item.MovieTitle}_${item.LocationName}`;
    return userRecords[key]?.isLiked;
  });

  const visitedItems = allData.filter((item) => {
    const key = `${item.MovieTitle}_${item.LocationName}`;
    return userRecords[key]?.visitHistory && userRecords[key].visitHistory!.length > 0;
  });

  return (
    <div className="app-container" style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* 지도 영역 */}
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* 상단 검색바 & 버튼 영역 */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        zIndex: 1000,
        display: 'flex',
        gap: '8px',
        width: 'calc(100% - 40px)',
        maxWidth: '380px',
        boxSizing: 'border-box'
      }}>
        <div style={{
          background: 'white',
          padding: '8px 14px',
          borderRadius: '24px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          display: 'flex',
          alignItems: 'center',
          flex: 1,
          boxSizing: 'border-box'
        }}>
          <input
            type="text"
            placeholder="🎬 영화/촬영지 검색"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (e.target.value) setSelectedMovie('');
            }}
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              fontSize: '13px',
              fontFamily: 'sans-serif',
              background: 'transparent',
              color: '#000000'
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#888', padding: '0 4px' }}
            >
              ✕
            </button>
          )}
        </div>

        {/* 내 저장 목록(마이페이지) 버튼 */}
        <button
          onClick={() => setIsDrawerOpen(true)}
          style={{
            background: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '42px',
            height: '42px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            flexShrink: '0',
            position: 'relative'
          }}
          title="내 목록 보기"
        >
          📂
          {(likedItems.length > 0 || visitedItems.length > 0) && (
            <span style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              width: '8px',
              height: '8px',
              background: '#e53935',
              borderRadius: '50%'
            }} />
          )}
        </button>

        {/* 기부 및 요청 버튼 */}
        <button
          onClick={() => setIsDonateOpen(true)}
          style={{
            background: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '42px',
            height: '42px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            flexShrink: '0'
          }}
          title="개발자 후원 및 영화 요청"
        >
          ☕
        </button>

        {/* 내 위치 이동 버튼 */}
        <button
          onClick={handlePanToCurrentLocation}
          style={{
            background: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '42px',
            height: '42px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            flexShrink: '0'
          }}
          title="내 위치로 이동"
        >
          🧭
        </button>
      </div>

      {/* 리액트 기반 커스텀 팝업창 */}
      {activePopupItem && (
        <div style={{
          position: 'absolute',
          top: '75px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          padding: '14px',
          width: '260px',
          maxHeight: '65vh',
          overflowY: 'auto',
          fontFamily: 'sans-serif',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#1a73e8' }}>{activePopupItem.MovieTitle}</h3>
            <button
              onClick={() => setActivePopupItem(null)}
              style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#888', padding: '0' }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#333' }}>📍 {activePopupItem.LocationName}</p>
            <button
              onClick={() => toggleLike(activeRecordKey)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', padding: 0 }}
              title="찜하기"
            >
              {activeRecord.isLiked ? '❤️' : '🤍'}
            </button>
          </div>

          {activePopupItem.SceneImageUrl && (
            <img
              src={activePopupItem.SceneImageUrl}
              alt={activePopupItem.LocationName}
              style={{ width: '100%', height: '120px', borderRadius: '6px', marginBottom: '8px', objectFit: 'cover' }}
            />
          )}

          {activePopupItem.Description && (
            <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#666', lineHeight: '1.4' }}>
              {activePopupItem.Description}
            </p>
          )}

          {/* 성지순례 체크인 영역 */}
          <div style={{ background: '#f8f9fa', padding: '8px', borderRadius: '6px', marginBottom: '8px', border: '1px solid #eee' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: activeRecord.visitHistory && activeRecord.visitHistory.length > 0 ? '6px' : '0' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#555' }}>
                성지순례 체크인 ({activeRecord.visitHistory ? activeRecord.visitHistory.length : 0}회)
              </span>
              <button
                onClick={() => addVisit(activeRecordKey)}
                style={{ background: '#34a853', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                + 체크인 기록
              </button>
            </div>

            {activeRecord.visitHistory && activeRecord.visitHistory.length > 0 && (
              <div style={{ maxHeight: '90px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {activeRecord.visitHistory.map((timeStr, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '3px 6px', borderRadius: '4px', border: '1px solid #e0e0e0', fontSize: '10px' }}>
                    <span style={{ color: '#137333' }}>⏱️ {timeStr}</span>
                    <button
                      onClick={() => removeVisit(activeRecordKey, idx)}
                      style={{ background: 'none', border: 'none', color: '#c5221f', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', padding: '0 4px' }}
                      title="기록 삭제"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {activePopupItem.YoutubeUrl && (
            <a href={activePopupItem.YoutubeUrl} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#1a73e8', fontWeight: 'bold', textDecoration: 'none' }}>
              ▶ 유튜브 영상에서 보기
            </a>
          )}
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${activePopupItem.lat},${activePopupItem.lng}`} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: '12px', color: '#34a853', fontWeight: 'bold', textDecoration: 'none' }}>
            🚗 현재 위치에서 길찾기
          </a>

          {activePopupItem.YoutubeMusicUrl && (() => {
            const getYouTubeId = (url: string) => {
              const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
              const match = url.match(regExp);
              return (match && match[2].length === 11) ? match[2] : null;
            };
            const videoId = getYouTubeId(activePopupItem.YoutubeMusicUrl);

            return videoId ? (
              <div style={{ marginTop: '8px' }}>
                <span style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#555', marginBottom: '4px' }}>
                  🎵 OST
                </span>
                <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: '6px', overflow: 'hidden', background: '#000' }}>
                  <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${videoId}`}
                    title="YouTube video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  ></iframe>
                </div>
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* 하단 고정 영역: 상단에 포스터 목록, 맨 아래에 광고 바 배치 */}
      <div style={{
        position: 'absolute',
        bottom: '10px',
        left: '0',
        right: '0',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        pointerEvents: 'auto'
      }}>
        {/* 하단 세로 비율 고정 포스터 카드 목록 */}
        <div style={{
          display: 'flex',
          gap: '10px',
          overflowX: 'auto',
          width: '100%',
          padding: '0 16px',
          boxSizing: 'border-box',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none'
        }}>
          {/* 모드 순환 토글 버튼 */}
          <div
            onClick={() => {
              const currentIndex = modeList.indexOf(viewMode);
              const nextMode = modeList[(currentIndex + 1) % modeList.length];
              setViewMode(nextMode);
              setSelectedMovie('');
              setSearchTerm('');
              setActivePopupItem(null);
            }}
            style={{
              flex: '0 0 80px',
              height: '118px',
              background: '#1a73e8',
              color: 'white',
              borderRadius: '10px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 'bold',
              transition: 'all 0.2s',
              border: '2px solid #1a73e8',
              flexShrink: 0
            }}
          >
            <span style={{ fontSize: '22px', marginBottom: '4px' }}>{modeEmojis[viewMode]}</span>
            {viewMode === '전체' ? '전체 보기' : `${viewMode} 모음`}
          </div>

          {filteredItems.map((item) => {
            const isSelected = selectedMovie === item.MovieTitle;
            return (
              <div
                key={item.MovieTitle}
                onClick={() => {
                  setSelectedMovie(isSelected ? '' : item.MovieTitle);
                  setSearchTerm('');
                  setActivePopupItem(null);
                }}
                style={{
                  height: '118px',
                  background: 'white',
                  borderRadius: '10px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  position: 'relative',
                  border: isSelected ? '3px solid #1a73e8' : '1px solid rgba(0,0,0,0.1)',
                  transition: 'all 0.2s',
                  transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {item.PosterUrl ? (
                  <img
                    src={item.PosterUrl}
                    alt={item.MovieTitle}
                    style={{
                      height: '100%',
                      width: 'auto',
                      objectFit: 'contain'
                    }}
                  />
                ) : (
                  <div style={{
                    width: '80px',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#f1f3f4',
                    color: '#333',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    padding: '4px',
                    boxSizing: 'border-box'
                  }}>
                    {item.MovieTitle}
                  </div>
                )}
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  padding: '6px 4px 4px 4px',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {item.MovieTitle}
                </div>
              </div>
            );
          })}
        </div>

        {/* 카카오 애드핏 배너 (320x50) - 포스터 아래 맨 하단 고정 */}
        <div 
          ref={adRef} 
          style={{ 
            width: '320px', 
            height: '50px', 
            minHeight: '50px',
            background: 'rgba(255,255,255,0.9)', 
            borderRadius: '6px', 
            overflow: 'hidden', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            flexShrink: 0
          }} 
        />
      </div>

      {/* 기부 및 영화 요청 팝업 모달 */}
      {isDonateOpen && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,0.5)',
          zIndex: 2000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: 'sans-serif'
        }}>
          <div style={{
            background: 'white',
            width: '90%',
            maxWidth: '360px',
            maxHeight: '85vh',
            borderRadius: '16px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            boxSizing: 'border-box',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '17px', color: '#202124' }}>☕ 개발자 후원 & 영화 요청</h2>
              <button
                onClick={() => setIsDonateOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#666' }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '8px', fontSize: '12px', color: '#444', lineHeight: '1.5', marginBottom: '14px', border: '1px solid #eee' }}>
              <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: '#1a73e8' }}>안녕하세요, 해석왕 고태일입니다.</p>
              <p style={{ margin: '0 0 6px 0' }}>영화를 사랑하는 모든 분들을 위해 코딩 하나 모르는 제가 이 어플을 만들기 위해 무단히 노력하고 있습니다.</p>
              <p style={{ margin: '0 0 6px 0' }}>하지만 서버 유지비나 지도 API 등 여러 비용적인 문제가 있고, 모든 영화를 혼자서 발굴하기엔 역부족입니다.</p>
              <p style={{ margin: 0 }}>광고 클릭이나 따뜻한 기부가 서비스 지속에 큰 힘이 됩니다. 많은 애용 부탁드립니다!</p>
            </div>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleRequestSubmit(e);
                window.open("https://qr.kakaopay.com/FPKyyZ36s", "_blank");
              }} 
              style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '10px' }}
            >
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#333' }}>🎬 원하는 영화/촬영지 요청하기</span>
              <input
                type="text"
                placeholder="예: 러브레터 오타루 촬영지"
                value={requestMovieTitle}
                onChange={(e) => setRequestMovieTitle(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px', outline: 'none' }}
              />
              <textarea
                placeholder="남기실 말씀이나 요청 사항 (선택)"
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px', outline: 'none', height: '50px', resize: 'none' }}
              />
              <button
                type="submit"
                disabled={isSubmitting}
                style={{ 
                  background: '#fee500', 
                  color: '#191919', 
                  border: 'none', 
                  padding: '12px', 
                  borderRadius: '8px', 
                  fontSize: '13px', 
                  fontWeight: 'bold', 
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                  marginTop: '4px'
                }}
              >
                {isSubmitting ? '처리 중...' : '💛 기부하고 요청 등록하기 🔗'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 마이페이지 / 내 서랍 모달 */}
      {isDrawerOpen && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,0.5)',
          zIndex: 2000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: 'sans-serif'
        }}>
          <div style={{
            background: 'white',
            width: '90%',
            maxWidth: '340px',
            maxHeight: '75vh',
            borderRadius: '16px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ margin: 0, fontSize: '17px', color: '#202124' }}>📂 내 성지순례 서랍</h2>
              <button
                onClick={() => setIsDrawerOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#666' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', borderBottom: '1px solid #eee', marginBottom: '12px' }}>
              <button
                onClick={() => setDrawerTab('liked')}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  border: 'none',
                  background: 'none',
                  borderBottom: drawerTab === 'liked' ? '2px solid #e53935' : 'none',
                  color: drawerTab === 'liked' ? '#e53935' : '#777',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                ❤️ 찜한 장소 ({likedItems.length})
              </button>
              <button
                onClick={() => setDrawerTab('visited')}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  border: 'none',
                  background: 'none',
                  borderBottom: drawerTab === 'visited' ? '2px solid #34a853' : 'none',
                  color: drawerTab === 'visited' ? '#34a853' : '#777',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                ✅ 체크인 목록 ({visitedItems.length})
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {drawerTab === 'liked' && (
                likedItems.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#999', textAlign: 'center', padding: '20px 0' }}>
                    아직 찜한 장소가 없습니다. 🤍를 눌러 장소를 보관해 보세요!
                  </p>
                ) : (
                  likedItems.map((item) => (
                    <div
                      key={`${item.MovieTitle}_${item.LocationName}`}
                      onClick={() => handleSelectLocationFromDrawer(item)}
                      style={{
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid #eee',
                        background: '#fcfcfc',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                      }}
                    >
                      {item.PosterUrl && <img src={item.PosterUrl} alt="" style={{ width: '36px', height: '48px', objectFit: 'cover', borderRadius: '4px' }} />}
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1a73e8' }}>{item.MovieTitle}</div>
                        <div style={{ fontSize: '11px', color: '#333' }}>{item.LocationName}</div>
                      </div>
                    </div>
                  ))
                )
              )}

              {drawerTab === 'visited' && (
                visitedItems.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#999', textAlign: 'center', padding: '20px 0' }}>
                    아직 체크인한 장소가 없습니다. 촬영지를 방문해 체크인을 남겨보세요!
                  </p>
                ) : (
                  visitedItems.map((item) => (
                    <div
                      key={`${item.MovieTitle}_${item.LocationName}`}
                      onClick={() => handleSelectLocationFromDrawer(item)}
                      style={{
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid #eee',
                        background: '#fcfcfc',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                      }}
                    >
                      {item.PosterUrl && <img src={item.PosterUrl} alt="" style={{ width: '36px', height: '48px', objectFit: 'cover', borderRadius: '4px' }} />}
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#34a853' }}>{item.MovieTitle}</div>
                        <div style={{ fontSize: '11px', color: '#333' }}>{item.LocationName}</div>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}